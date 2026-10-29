// sidecar-receiver: a Mac as the screen another Mac streams to (Sidecar's colour stream, plugins/display-rmpp/stream.h; the sender is
// sidecar-screen, screen.swift). It listens on TCP, says its size and what it reads, and shows the pictures full screen.
// The picture: three IOSurfaces in turn. A picture's RECTs are decoded on every core straight into the one not on the screen (brought up
// to date first with what the pictures since it changed), and once the last one is in, that surface becomes the layer's contents in one
// Core Animation commit: a whole picture at once, never half of one, no copy through the GPU. A video: VideoToolbox decodes the H.264
// units in hardware into IOSurface-backed pixel buffers, set as the contents of a layer over the video's region (no CPU copy); the tiles
// under it are never seen while it plays. Its end hides that layer with the next picture, the one that paints its place.
// The same file is the iPad's app (app/sidecar/ipad, its main.swift): reached on the USB cable through usbmux (sidecar-screen --host usb).
#if os(macOS)
import AppKit
import SystemConfiguration
#else
import UIKit
#endif
import QuartzCore
import VideoToolbox
import CoreMedia
import CoreImage
import IOSurface
import ImageIO
import UniformTypeIdentifiers
import AVFoundation

setvbuf(stdout, nil, _IOLBF, 0)
signal(SIGPIPE, SIG_IGN)
func die(_ s: String) -> Never { print("sidecar-receiver: \(s)"); exit(1) }
let usage = """
sidecar-receiver: this Mac as the screen another Mac streams to (Sidecar).
  sidecar-receiver [--port 7710] [--size WxH] [--windowed] [--background] [--shot file.png [--shot-after seconds]]
  --size WxH     the picture's size in pixels (default: the main display's native pixels, 5120x2880 on an iMac 5K)
  --windowed     a window instead of the whole main display
  --background   never takes the focus (a window, no Dock icon): for tests
  --shot f.png   writes the composed picture (base + video) after --shot-after seconds (default 5)
On the sending Mac: sidecar-screen --host <this Mac>.local (add --hidpi for Retina-sized text: its virtual display is half this size in
points, drawn at twice). Esc or Cmd-Q quits.
"""
var port: UInt16 = 7710, size: (Int, Int)?, windowed = false, background = false, shotPath = "", shotAfter = 5.0
var argv = Array(CommandLine.arguments.dropFirst())
while !argv.isEmpty {
    let a = argv.removeFirst()
    func val() -> String { if argv.isEmpty { die("\(a) needs a value") }; return argv.removeFirst() }
    switch a {
    case "--port": guard let p = UInt16(val()) else { die("--port needs a number") }; port = p
    case "--size": let v = val().split(separator: "x").compactMap { Int($0) }
        guard v.count == 2, v[0] > 0, v[1] > 0, v[0] <= 16384, v[1] <= 16384 else { die("--size needs WxH") }; size = (v[0], v[1])
    case "--windowed": windowed = true
    case "--background": background = true; windowed = true
    case "--shot": shotPath = val()
    case "--shot-after": guard let s = Double(val()) else { die("--shot-after needs seconds") }; shotAfter = s
    case "-h", "--help": print(usage); exit(0)
    default: print(usage); die("unknown option \(a)")
    }
}

/** The main display's native pixels: its mode marked native, else its largest 1x mode, else what it shows now. */
func nativeSize() -> (Int, Int) {
    #if os(iOS)
    let b = UIScreen.main.nativeBounds   // portrait pixels; the app runs in landscape
    return (Int(max(b.width, b.height)), Int(min(b.width, b.height)))
    #else
    let id = CGMainDisplayID()
    let modes = (CGDisplayCopyAllDisplayModes(id, [kCGDisplayShowDuplicateLowResolutionModes: true] as CFDictionary) as? [CGDisplayMode]) ?? []
    if let m = modes.first(where: { $0.ioFlags & 0x0200_0000 != 0 }) { return (m.pixelWidth, m.pixelHeight) }   // kDisplayModeNativeFlag
    if let m = modes.filter({ $0.width == $0.pixelWidth }).max(by: { $0.pixelWidth < $1.pixelWidth }) { return (m.pixelWidth, m.pixelHeight) }
    let m = CGDisplayCopyDisplayMode(id)
    return (m?.pixelWidth ?? 1920, m?.pixelHeight ?? 1080)
    #endif
}
let (W, H) = size ?? nativeSize()
// this device's name, as the Mac shows the screen in its Displays (the hello's +name:, percent-encoded: one word)
#if os(macOS)
let kindName = "Mac"
let deviceName = (Host.current().localizedName ?? "Mac").addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "Mac"
#else
let kindName = UIDevice.current.model   // iPad, iPhone
// ponytail: iOS 16 gives an app "iPad" here, not the name the owner chose (that takes an entitlement Apple grants on request)
let deviceName = UIDevice.current.name.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "iPad"
#endif
func now_us() -> UInt32 { UInt32(truncatingIfNeeded: clock_gettime_nsec_np(CLOCK_UPTIME_RAW) / 1000) }

// --- the picture's three surfaces (BGRA)
struct Box { var x0, y0, x1, y1: Int }
func makeSurface() -> IOSurfaceRef {
    let bpr = IOSurfaceAlignProperty(kIOSurfaceBytesPerRow, W * 4)
    let s = IOSurfaceCreate([kIOSurfaceWidth: W, kIOSurfaceHeight: H, kIOSurfaceBytesPerElement: 4, kIOSurfaceBytesPerRow: bpr,
                             kIOSurfacePixelFormat: kCVPixelFormatType_32BGRA] as CFDictionary)!
    IOSurfaceLock(s, [], nil)
    var black: UInt32 = 0xFF00_0000
    memset_pattern4(IOSurfaceGetBaseAddress(s), &black, IOSurfaceGetAllocSize(s))
    IOSurfaceUnlock(s, [], nil)
    return s
}
let surf = (0..<3).map { _ in makeSurface() }
let BPR = IOSurfaceGetBytesPerRow(surf[0])
func base(_ i: Int) -> UnsafeMutablePointer<UInt8> { IOSurfaceGetBaseAddress(surf[i]).assumingMemoryBound(to: UInt8.self) }
var latest = 0                                    // the newest whole picture (stream thread)
let shownLock = NSLock(); var displayed = 0       // the one Core Animation was last given (main thread)
var stale = [[Box]](repeating: [], count: 3)      // per surface: what the pictures since it was the newest changed
var back = -1                                     // the surface the picture being read goes into, -1 between pictures
var dirty = [Box]()
let full = Box(x0: 0, y0: 0, x1: W, y1: H)

// --- the connection's answers: 16 bytes [u8 kind][u8 type][u16 id][i32 a][i32 b][i32 c]
let wire = NSLock()
var client: Int32 = -1, acked: Int32 = 0
func send16(_ kind: UInt8, _ type: UInt8, _ a: Int32, _ b: Int32, _ c: Int32, ack: Bool = false, id: Int = 0) {
    wire.lock(); defer { wire.unlock() }
    guard client >= 0 else { return }
    var m = [UInt8](repeating: 0, count: 16); m[0] = kind; m[1] = type; m[2] = UInt8(id & 255); m[3] = UInt8(id >> 8 & 255)
    if ack { acked &+= 1 }
    for (i, v) in [ack ? acked : a, b, c].enumerated() { withUnsafeBytes(of: v.littleEndian) { for k in 0..<4 { m[4 + i * 4 + k] = $0[k] } } }
    _ = send(client, m, 16, 0)
}
func readFull(_ c: Int32, _ p: UnsafeMutableRawPointer, _ n: Int) -> Bool {
    var got = 0
    while got < n { let r = read(c, p + got, n - got); if r < 0 && errno == EINTR { continue }; if r <= 0 { return false }; got += r }
    return true
}
func skip(_ c: Int32, _ n: Int) -> Bool {
    var left = n, b = [UInt8](repeating: 0, count: 1 << 16)
    while left > 0 { let k = min(left, b.count); if !readFull(c, &b, k) { return false }; left -= k }
    return true
}

// --- HOST: this Mac's CPU, memory, uptime (no public temperature or clock on Apple silicon: -1)
var ticks0 = (busy: UInt64(0), all: UInt64(0))
func sysctlInt(_ name: String) -> Int64? { var v: Int64 = 0, n = 8; return sysctlbyname(name, &v, &n, nil, 0) == 0 ? (n == 4 ? Int64(Int32(truncatingIfNeeded: v)) : v) : nil }
func sendHost() {
    var ncpu: natural_t = 0, info: processor_info_array_t?, n: mach_msg_type_number_t = 0, load: Int32 = -1
    if host_processor_info(mach_host_self(), PROCESSOR_CPU_LOAD_INFO, &ncpu, &info, &n) == KERN_SUCCESS, let info {
        var busy: UInt64 = 0, all: UInt64 = 0
        for i in 0..<Int(ncpu) {
            let t = (0..<Int(CPU_STATE_MAX)).map { UInt64(UInt32(bitPattern: info[i * Int(CPU_STATE_MAX) + $0])) }
            all += t.reduce(0, +); busy += t[Int(CPU_STATE_USER)] + t[Int(CPU_STATE_SYSTEM)] + t[Int(CPU_STATE_NICE)]
        }
        if all > ticks0.all { load = Int32((busy - ticks0.busy) * 1000 / (all - ticks0.all)) }
        ticks0 = (busy, all)
        vm_deallocate(mach_task_self_, vm_address_t(bitPattern: info), vm_size_t(n) * vm_size_t(MemoryLayout<integer_t>.size))
    }
    var vm = vm_statistics64(), cnt = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size), free: Int32 = -1
    if withUnsafeMutablePointer(to: &vm, { $0.withMemoryRebound(to: integer_t.self, capacity: Int(cnt)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &cnt) } }) == KERN_SUCCESS {
        free = Int32((UInt64(vm.free_count) + UInt64(vm.inactive_count)) * UInt64(vm_kernel_page_size) / 1_048_576)
    }
    send16(10, 0, -1, load, free)
    let mhz = { (k: String) in sysctlInt(k).map { Int32($0 / 1_000_000) } ?? -1 }
    send16(10, 1, mhz("hw.cpufrequency"), mhz("hw.cpufrequency_max"), -1)
    var boot = timeval(), bn = MemoryLayout<timeval>.size
    let up: Int32 = sysctlbyname("kern.boottime", &boot, &bn, nil, 0) == 0 ? Int32(time(nil) - boot.tv_sec) : -1
    send16(10, 2, Int32((sysctlInt("hw.memsize") ?? -1 << 20) >> 20), up, 0)
}

// --- the RECTs, decoded on every core into the back surface
let decodeGroup = DispatchGroup(), decodeQ = DispatchQueue(label: "decode", qos: .userInteractive, attributes: .concurrent)
let poolLock = NSLock(); var dctxPool = [OpaquePointer]()
var bad = false   // a RECT that did not decode (under poolLock)
func decodeRect(_ data: [UInt8], _ dst: UnsafeMutablePointer<UInt8>, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ codec: Int, _ sub: Bool) -> Bool {
    let stride = w * 3, raw = stride * h
    var plain = [UInt8]()
    if codec != 0 {
        plain = [UInt8](unsafeUninitializedCapacity: raw) { _, n in n = raw }
        if codec == 1 {
            guard LZ4_decompress_safe(data, &plain, Int32(data.count), Int32(raw)) == Int32(raw) else { return false }
        } else {
            poolLock.lock(); let ctx = dctxPool.popLast() ?? ZSTD_createDCtx()!; poolLock.unlock()
            let n = ZSTD_decompressDCtx(ctx, &plain, raw, data, data.count)
            poolLock.lock(); dctxPool.append(ctx); poolLock.unlock()
            guard n == raw else { return false }
        }
    } else if data.count < raw { return false }
    (codec != 0 ? plain : data).withUnsafeBufferPointer { src in
        for r in 0..<h {
            let s = src.baseAddress! + r * stride
            let d = UnsafeMutableRawPointer(dst + (y + r) * BPR + x * 4).assumingMemoryBound(to: UInt32.self)
            if sub {
                var b: UInt8 = 0, g: UInt8 = 0, rr: UInt8 = 0
                for i in 0..<w { b &+= s[i * 3]; g &+= s[i * 3 + 1]; rr &+= s[i * 3 + 2]; d[i] = UInt32(b) | UInt32(g) << 8 | UInt32(rr) << 16 | 0xFF00_0000 }
            } else {
                for i in 0..<w { d[i] = UInt32(s[i * 3]) | UInt32(s[i * 3 + 1]) << 8 | UInt32(s[i * 3 + 2]) << 16 | 0xFF00_0000 }
            }
        }
    }
    return true
}
func copyBoxes(_ boxes: [Box], from: Int, to: Int) {
    let s = base(from), d = base(to)
    let area = boxes.reduce(0) { $0 + ($1.x1 - $1.x0) * ($1.y1 - $1.y0) }
    if area * 2 >= W * H { memcpy(d, s, BPR * H); return }   // ponytail: overlapping boxes copy twice, a union when it shows in a profile
    for b in boxes { for y in b.y0..<b.y1 { memcpy(d + y * BPR + b.x0 * 4, s + y * BPR + b.x0 * 4, (b.x1 - b.x0) * 4) } }
}
var pictureT0: UInt32 = 0
/** The first message of a picture: a surface Core Animation does not hold, brought up to date with the newest picture. */
func beginPicture() {
    guard back < 0 else { return }
    shownLock.lock(); let d = displayed; shownLock.unlock()
    let b = (0..<3).first { $0 != latest && $0 != d }!
    for _ in 0..<200 where IOSurfaceIsInUse(surf[b]) { usleep(100) }   // the window server still composes it: 20 ms at most
    IOSurfaceLock(surf[b], [], nil)
    copyBoxes(stale[b], from: latest, to: b)
    stale[b] = []
    back = b; dirty = []; pictureT0 = now_us()
}
/** The last message of a picture is in: once every RECT is decoded the surface is shown. False when one did not decode. */
func endPicture(_ lastByte: UInt32) -> Bool {
    guard back >= 0 else { return true }
    decodeGroup.wait()
    let decodeUs = Int32(bitPattern: now_us() &- pictureT0)
    IOSurfaceUnlock(surf[back], [], nil)
    poolLock.lock(); let ok = !bad; bad = false; poolLock.unlock()
    for j in 0..<3 where j != back {
        stale[j] += dirty
        if stale[j].count > 512 { stale[j] = [full] }
    }
    latest = back; back = -1
    let i = latest
    DispatchQueue.main.async { present(i, lastByte, decodeUs) }
    return ok
}

// --- the video (VIDEO, type 10): Annex B H.264 units, VideoToolbox in hardware, a layer over its region
let vLock = NSLock(); var vgen = 0, vhide = false   // the video's generation (a frame of an older one is not shown); hide at the next picture
let videoQ = DispatchQueue(label: "video", qos: .userInteractive)
final class VideoDecoder {
    var session: VTDecompressionSession?, format: CMVideoFormatDescription?
    var place = (0, 0, 0, 0), sps = [UInt8](), pps = [UInt8]()
    var decodeUs = [Int]()
    func reset() { if let s = session { VTDecompressionSessionInvalidate(s) }; session = nil; format = nil; sps = []; pps = [] }
    /** The NAL units of an Annex B unit (without their start codes). */
    static func nals(_ d: [UInt8]) -> [ArraySlice<UInt8>] {
        var starts = [(Int, Int)](), i = 0
        while i + 2 < d.count {
            if d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 1 { starts.append((i > 0 && d[i - 1] == 0 ? i - 1 : i, i + 3)); i += 3 } else { i += 1 }
        }
        return starts.enumerated().map { k, s in d[s.1..<(k + 1 < starts.count ? starts[k + 1].0 : d.count)] }.filter { !$0.isEmpty }
    }
    /** One unit for (x, y, w, h) that came at `t`: decoded, ACKed (type 10, b: µs from its last byte to its picture), shown. */
    func unit(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ au: [UInt8], _ t: UInt32, _ gen: Int) {
        var acked = false
        let fail = { if !acked { acked = true; send16(1, 10, 0, 0, 0, ack: true) } }
        if (x, y, w, h) != place { reset(); place = (x, y, w, h) }   // a new place or size: a new decoder
        var avcc = [UInt8]()
        for n in VideoDecoder.nals(au) {
            switch n.first! & 31 {
            case 7: if Array(n) != sps { sps = Array(n); format = nil }
            case 8: if Array(n) != pps { pps = Array(n); format = nil }
            default: avcc += withUnsafeBytes(of: UInt32(n.count).bigEndian, Array.init); avcc += n
            }
        }
        if format == nil, !sps.isEmpty, !pps.isEmpty {
            sps.withUnsafeBufferPointer { s in pps.withUnsafeBufferPointer { p in
                _ = CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator: nil, parameterSetCount: 2, parameterSetPointers: [s.baseAddress!, p.baseAddress!],
                                                                        parameterSetSizes: [s.count, p.count], nalUnitHeaderLength: 4, formatDescriptionOut: &format) } }
            if let s = session, let f = format, !VTDecompressionSessionCanAcceptFormatDescription(s, formatDescription: f) { VTDecompressionSessionInvalidate(s); session = nil }
        }
        guard let format, !avcc.isEmpty else { return fail() }
        if session == nil {
            let attrs = [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary] as CFDictionary
            #if os(macOS)
            let spec: CFDictionary? = [kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder: true] as CFDictionary
            #else
            let spec: CFDictionary? = nil   // always the hardware's on iOS
            #endif
            VTDecompressionSessionCreate(allocator: nil, formatDescription: format, decoderSpecification: spec, imageBufferAttributes: attrs, outputCallback: nil, decompressionSessionOut: &session)
            if let s = session { VTSessionSetProperty(s, key: kVTDecompressionPropertyKey_RealTime, value: kCFBooleanTrue) }
        }
        guard let s = session else { return fail() }
        var bb: CMBlockBuffer?, sb: CMSampleBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: avcc.count, blockAllocator: nil, customBlockSource: nil,
                                                 offsetToData: 0, dataLength: avcc.count, flags: 0, blockBufferOut: &bb) == noErr, let bb,
              CMBlockBufferReplaceDataBytes(with: avcc, blockBuffer: bb, offsetIntoDestination: 0, dataLength: avcc.count) == noErr,
              CMSampleBufferCreateReady(allocator: nil, dataBuffer: bb, formatDescription: format, sampleCount: 1, sampleTimingEntryCount: 0, sampleTimingArray: nil,
                                        sampleSizeEntryCount: 1, sampleSizeArray: [avcc.count], sampleBufferOut: &sb) == noErr, let sb else { return fail() }
        // synchronous (no asynchronous flag), in real time: the picture comes out of this call, none is held back for reordering
        let st = VTDecompressionSessionDecodeFrame(s, sampleBuffer: sb, flags: [._1xRealTimePlayback], infoFlagsOut: nil) { status, _, image, _, _ in
            guard status == noErr, let pb = image else { return }
            let us = Int32(bitPattern: now_us() &- t)
            acked = true; send16(1, 10, 0, us, 0, ack: true)
            self.decodeUs.append(Int(us))
            DispatchQueue.main.async { showVideo(pb, x, y, w, h, gen) }
        }
        if st != noErr { fail() }
        VTDecompressionSessionWaitForAsynchronousFrames(s)
        fail()   // no picture came out of it: ACKed all the same, or the sender waits for ever
    }
}
let video = VideoDecoder()

// --- the window
// --- input: this screen's mouse (a Mac) or fingers and pen (an iPad), to the Mac streaming as INPUT and SCROLL (stream.h): it plays them as
// its mouse. Where, in the picture's pixels (the picture is centred, scaled by s points a pixel)
func streamPoint(_ p: CGPoint, _ b: CGRect, flipped: Bool) -> (Int32, Int32) {
    let s = min(b.width / CGFloat(W), b.height / CGFloat(H))
    let x = (p.x - b.midX) / s + CGFloat(W) / 2, y = (flipped ? p.y - b.midY : b.midY - p.y) / s + CGFloat(H) / 2
    return (Int32(max(0, min(CGFloat(W - 1), x))), Int32(max(0, min(CGFloat(H - 1), y))))
}
func input(_ type: UInt8, _ at: (Int32, Int32), id: Int = 0, pressure: Int32 = 0) { send16(2, type, at.0, at.1, pressure, id: id) }
#if os(macOS)
final class Window: NSWindow { override var canBecomeKey: Bool { true }; override var canBecomeMain: Bool { true } }
final class View: NSView {
    let blank = NSCursor(image: NSImage(size: NSSize(width: 1, height: 1)), hotSpot: .zero)
    override func resetCursorRects() { addCursorRect(bounds, cursor: blank) }
    override func updateTrackingAreas() {
        super.updateTrackingAreas(); trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseMoved, .activeAlways, .inVisibleRect], owner: self))
    }
    // the mouse: its button as a finger (0x10 press, 0x12 move, 0x11 release), moved without it as 0x13; the wheel as two fingers
    func at(_ e: NSEvent) -> (Int32, Int32) { streamPoint(convert(e.locationInWindow, from: nil), bounds, flipped: false) }
    override func mouseDown(with e: NSEvent) { input(0x10, at(e)) }
    override func mouseDragged(with e: NSEvent) { input(0x12, at(e)) }
    override func mouseUp(with e: NSEvent) { input(0x11, at(e)) }
    override func mouseMoved(with e: NSEvent) { input(0x13, at(e)) }
    override func scrollWheel(with e: NSEvent) {
        let s = min(bounds.width / CGFloat(W), bounds.height / CGFloat(H))
        send16(6, 0, Int32((e.scrollingDeltaX / s).rounded()), Int32((e.scrollingDeltaY / s).rounded()), 0)
    }
    override func layout() {
        super.layout()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let s = min(bounds.width / CGFloat(W), bounds.height / CGFloat(H))   // points per picture pixel: 1:1 on the screen's pixels at its size
        picture.position = CGPoint(x: bounds.midX, y: bounds.midY)
        picture.setAffineTransform(CGAffineTransform(scaleX: s, y: s))
        CATransaction.commit()
    }
}
#endif
let picture = CALayer(), videoLayer = CALayer()
var videoShown: CVPixelBuffer?   // kept alive while its surface is the layer's contents
picture.bounds = CGRect(x: 0, y: 0, width: W, height: H)
picture.contentsGravity = .resize
picture.contents = surf[0]
picture.backgroundColor = CGColor(gray: 0, alpha: 1)
videoLayer.isHidden = true
picture.addSublayer(videoLayer)

func present(_ i: Int, _ lastByte: UInt32, _ decodeUs: Int32) {
    CATransaction.begin(); CATransaction.setDisableActions(true)
    picture.contents = surf[i]
    vLock.lock(); if vhide { vhide = false; videoLayer.isHidden = true; videoLayer.contents = nil; videoShown = nil }; vLock.unlock()
    CATransaction.commit()
    CATransaction.flush()
    shownLock.lock(); displayed = i; shownLock.unlock()
    send16(12, 0, Int32(bitPattern: now_us() &- lastByte), decodeUs, 0)
    pictures += 1
    #if os(iOS)
    waiting.isHidden = true
    #endif
}
func showVideo(_ pb: CVPixelBuffer, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ gen: Int) {
    vLock.lock(); defer { vLock.unlock() }
    guard gen == vgen, let s = CVPixelBufferGetIOSurface(pb)?.takeUnretainedValue() else { return }
    vhide = false
    CATransaction.begin(); CATransaction.setDisableActions(true)
    #if os(macOS)
    videoLayer.frame = CGRect(x: x, y: H - y - h, width: w, height: h)   // the layer's y goes up, the stream's down
    #else
    videoLayer.frame = CGRect(x: x, y: y, width: w, height: h)           // UIKit's layers go down, as the stream
    #endif
    videoLayer.contents = s
    videoLayer.isHidden = false
    CATransaction.commit()
    CATransaction.flush()
    videoShown = pb
    videoFrames += 1
}
var pictures = 0, videoFrames = 0

#if os(macOS)
let app = NSApplication.shared
app.setActivationPolicy(background ? .accessory : .regular)
let screen = NSScreen.main!
let window: Window
if windowed {
    let k = screen.backingScaleFactor, vis = screen.visibleFrame
    var sz = NSSize(width: CGFloat(W) / k, height: CGFloat(H) / k)
    let fit = min(1, vis.width * 0.8 / sz.width, vis.height * 0.8 / sz.height); sz.width *= fit; sz.height *= fit
    window = Window(contentRect: NSRect(x: vis.midX - sz.width / 2, y: vis.midY - sz.height / 2, width: sz.width, height: sz.height),
                    styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
    window.title = "Sidecar receiver \(W) × \(H)"
} else {
    window = Window(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.level = .mainMenu + 1
    window.collectionBehavior = [.fullScreenPrimary, .stationary]
}
window.backgroundColor = .black
window.isReleasedWhenClosed = false
let view = View(frame: NSRect(origin: .zero, size: window.contentRect(forFrameRect: window.frame).size))
view.wantsLayer = true
view.layer!.backgroundColor = .black
view.layer!.addSublayer(picture)
window.contentView = view
let menu = NSMenu(), item = NSMenuItem(); menu.addItem(item)
item.submenu = NSMenu(); item.submenu!.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
app.mainMenu = menu
NSEvent.addLocalMonitorForEvents(matching: .keyDown) { e in
    if e.keyCode == 53 || (e.modifierFlags.contains(.command) && e.charactersIgnoringModifiers == "q") { exit(0) }
    return e
}
final class Delegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
}
let delegate = Delegate(); app.delegate = delegate
if background { window.orderFront(nil) } else {
    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    if !windowed { app.presentationOptions = [.hideDock, .hideMenuBar]; NSCursor.hide() }
}
print("window \(window.windowNumber)")
#else
// the iPad: the picture fills the screen in landscape; until the Mac sends one, how to start it
final class Root: UIViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black; view.isMultipleTouchEnabled = true
        view.layer.addSublayer(picture)
        if waiting.text?.isEmpty ?? true { waiting.text = "Sidecar\n\nPlug this \(UIDevice.current.model) into the Mac with its cable, then choose it in Sidecar on the Mac (iPad or iPhone on the USB cable)." }
        waiting.numberOfLines = 0; waiting.textAlignment = .center; waiting.textColor = .lightGray; waiting.font = .systemFont(ofSize: 22)
        waiting.frame = view.bounds; waiting.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(waiting)
    }
    // one finger is the Mac's mouse (its press waits 60 ms: a second finger then makes it a scroll, not a click), two fingers scroll,
    // the Pencil draws with its pressure and tilt
    var finger: UITouch?, pressAt: CGPoint?, fingers = false, centre = CGPoint.zero, pressTimer: Timer?
    func at(_ t: UITouch) -> (Int32, Int32) { streamPoint(t.location(in: view), view.bounds, flipped: true) }
    func pen(_ type: UInt8, _ t: UITouch) {
        let lean = (CGFloat.pi / 2 - t.altitudeAngle) * 180 / .pi, az = t.azimuthAngle(in: view)
        let tx = Int(max(-90, min(90, cos(az) * lean))), ty = Int(max(-90, min(90, sin(az) * lean)))
        let force = t.maximumPossibleForce > 0 ? t.force / t.maximumPossibleForce : 0.5
        input(type, at(t), id: (tx & 255) | (ty & 255) << 8, pressure: Int32(force * 4096))
    }
    func press() { pressTimer?.invalidate(); pressTimer = nil; if let p = pressAt { pressAt = nil; input(0x10, streamPoint(p, view.bounds, flipped: true)) } }
    func middle(_ e: UIEvent?) -> CGPoint {
        let ts = (e?.allTouches ?? []).filter { $0.type != .pencil && $0.phase != .ended && $0.phase != .cancelled }
        guard !ts.isEmpty else { return centre }
        let ps = ts.map { $0.location(in: view) }
        return CGPoint(x: ps.map(\.x).reduce(0, +) / CGFloat(ps.count), y: ps.map(\.y).reduce(0, +) / CGFloat(ps.count))
    }
    override func touchesBegan(_ touches: Set<UITouch>, with e: UIEvent?) {
        for t in touches {
            if t.type == .pencil { pen(0x20, t); continue }
            if finger == nil && !fingers {
                finger = t; pressAt = t.location(in: view)
                pressTimer = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: false) { [weak self] _ in self?.press() }
            } else if !fingers {   // a second finger: a scroll; a press already sent is let go where it was
                if pressAt == nil, let f = finger { input(0x11, at(f)) }
                pressTimer?.invalidate(); pressTimer = nil; pressAt = nil; finger = nil
                fingers = true; centre = middle(e)
            }
        }
    }
    override func touchesMoved(_ touches: Set<UITouch>, with e: UIEvent?) {
        for t in touches where t.type == .pencil { for c in e?.coalescedTouches(for: t) ?? [t] { pen(0x22, c) } }
        if let f = finger, touches.contains(f) { press(); for c in e?.coalescedTouches(for: f) ?? [f] { input(0x12, at(c)) } }
        if fingers {
            let c = middle(e), s = min(view.bounds.width / CGFloat(W), view.bounds.height / CGFloat(H))
            send16(6, 0, Int32(((c.x - centre.x) / s).rounded()), Int32(((c.y - centre.y) / s).rounded()), 0)
            centre = c
        }
    }
    override func touchesEnded(_ touches: Set<UITouch>, with e: UIEvent?) {
        for t in touches {
            if t.type == .pencil { pen(0x21, t); continue }
            if t == finger { press(); input(0x11, at(t)); finger = nil }
        }
        if fingers { centre = middle(e); if (e?.allTouches ?? []).allSatisfy({ $0.phase == .ended || $0.phase == .cancelled }) { fingers = false } }
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with e: UIEvent?) { touchesEnded(touches, with: e) }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let b = view.bounds
        let s = min(b.width / CGFloat(W), b.height / CGFloat(H))   // points per picture pixel: 1:1 on the screen's pixels at its size
        picture.position = CGPoint(x: b.midX, y: b.midY)
        picture.setAffineTransform(CGAffineTransform(scaleX: s, y: s))
        CATransaction.commit()
    }
}
let waiting = UILabel()
final class Delegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ a: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window!.rootViewController = Root()
        window!.makeKeyAndVisible()
        a.isIdleTimerDisabled = true   // the screen stays on while it is the Mac's
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        return true
    }
}
#endif

// --- the shot: the newest picture with the video over it, as a PNG
func writeShot() {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return }
    let i = (picture.contents as! IOSurfaceRef) === surf[0] ? 0 : (picture.contents as! IOSurfaceRef) === surf[1] ? 1 : 2
    if let dp = CGDataProvider(dataInfo: nil, data: base(i), size: BPR * H, releaseData: { _, _, _ in }),
       let img = CGImage(width: W, height: H, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: BPR, space: cs,
                         bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
                         provider: dp, decode: nil, shouldInterpolate: false, intent: .defaultIntent) { ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H)) }
    if !videoLayer.isHidden, let pb = videoShown, let img = CIContext().createCGImage(CIImage(cvPixelBuffer: pb), from: CIImage(cvPixelBuffer: pb).extent) {
        ctx.draw(img, in: videoLayer.frame)
    }
    guard let out = ctx.makeImage(), let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: shotPath) as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(d, out, nil)
    print(CGImageDestinationFinalize(d) ? "shot \(shotPath)\(videoLayer.isHidden ? "" : " (video at \(videoLayer.frame))")" : "shot failed")
}
if !shotPath.isEmpty { DispatchQueue.main.asyncAfter(deadline: .now() + shotAfter) { writeShot() } }

// --- listening, one sender at a time
let ls = socket(AF_INET, SOCK_STREAM, 0)
var one: Int32 = 1
setsockopt(ls, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = port.bigEndian; addr.sin_addr.s_addr = INADDR_ANY
if withUnsafePointer(to: &addr, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(ls, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) != 0 || listen(ls, 1) != 0 {
    die("cannot listen on \(port): \(String(cString: strerror(errno)))")
}
do {
    var names = [String](), list: UnsafeMutablePointer<ifaddrs>?
    if getifaddrs(&list) == 0 {
        var p = list
        while let i = p?.pointee {
            if let a = i.ifa_addr, a.pointee.sa_family == sa_family_t(AF_INET), i.ifa_flags & UInt32(IFF_LOOPBACK) == 0, i.ifa_flags & UInt32(IFF_UP) != 0 {
                var sin = a.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }, t = [CChar](repeating: 0, count: 64)
                inet_ntop(AF_INET, &sin, &t, 64); names.append("\(String(cString: t)) (\(String(cString: i.ifa_name)))")
            }
            p = i.ifa_next
        }
        freeifaddrs(list)
    }
    #if os(macOS)
    let local = (SCDynamicStoreCopyLocalHostName(nil) as String?).map { "\($0).local" } ?? "<this Mac>.local"
    #else
    let local = "usb"
    #endif
    print("sidecar-receiver: \(W)x\(H), listening on port \(port): \(local), \(names.joined(separator: ", "))")
    #if os(iOS)
    let wifi = names.filter { $0.hasSuffix("(en0)") }.map { String($0.prefix { $0 != " " }) }
    DispatchQueue.main.async {
        waiting.text = "Sidecar\n\nPlug this \(UIDevice.current.model) into the Mac with its cable, then choose it in Sidecar on the Mac (iPad or iPhone on the USB cable)."
            + (wifi.isEmpty ? "" : "\n\nOr on the same Wi-Fi: Sidecar on the Mac lists it under Add a screen (\(wifi.joined(separator: ", ")))")
    }
    #endif
    print("on the sending Mac: sidecar-screen --host \(local)\(port == 7710 ? "" : " --port \(port)") [--hidpi]")
}
// the screen on the network, for the Mac's "Add a screen" (Bonjour: _zinc-sidecar._tcp, the device's name)
#if os(macOS)
let bonjour = NetService(domain: "local.", type: "_zinc-sidecar._tcp.", name: Host.current().localizedName ?? "", port: Int32(port))
#else
let bonjour = NetService(domain: "local.", type: "_zinc-sidecar._tcp.", name: UIDevice.current.name, port: Int32(port))
#endif
bonjour.publish()

func serve(_ c: Int32) {
    var one: Int32 = 1
    setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
    setsockopt(c, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
    let hello = Array("RMPP \(W) \(H) \(kindName) +lz4 +copy +zstd +sub +sink +rgb +h264 +name:\(deviceName)\n".utf8)
    guard write(c, hello, hello.count) == hello.count else { return }
    wire.lock(); client = c; acked = 0; wire.unlock()
    sendHost()
    var hostAt = now_us(), rects = 0, units = 0
    let t0 = Date()
    var h = [UInt8](repeating: 0, count: 16)
    loop: while readFull(c, &h, 16) {
        if now_us() &- hostAt > 2_000_000 { hostAt = now_us(); sendHost() }
        let u16 = { (o: Int) in Int(h[o]) | Int(h[o + 1]) << 8 }
        let type = h[0], depth = h[1], x = u16(2), y = u16(4), w = u16(6), hh = u16(8), codec = Int(h[10] & 0x7f), sub = h[10] & 0x80 != 0, more = h[11] & 1 != 0
        let len = Int(UInt32(h[12]) | UInt32(h[13]) << 8 | UInt32(h[14]) << 16 | UInt32(h[15]) << 24)
        switch type {
        case 1:   // RECT, depth 24
            let raw = w * hh * 3
            guard depth == 24, codec <= 2, x + w <= W, y + hh <= H, codec != 0 ? len > 0 && len <= raw + raw / 255 + 64 : len >= raw, len <= W * H * 3 + 64 else { break loop }
            var data = [UInt8](unsafeUninitializedCapacity: len) { _, n in n = len }
            guard readFull(c, &data, len) else { break loop }
            beginPicture()
            let dst = base(back), payload = data
            decodeQ.async(group: decodeGroup) {
                let t = now_us()
                if decodeRect(payload, dst, x, y, w, hh, codec, sub) { send16(1, 0, 0, Int32(bitPattern: now_us() &- t), 0, ack: true) }
                else { poolLock.lock(); bad = true; poolLock.unlock() }
            }
            dirty.append(Box(x0: x, y0: y, x1: x + w, y1: y + hh)); rects += 1
            if !more && !endPicture(now_us()) { break loop }
        case 6:   // COPY: the rectangle moves by [i16 dx][i16 dy]
            var d = [Int16](repeating: 0, count: 2)
            guard len == 4, readFull(c, &d, 4) else { break loop }
            let dx = Int(Int16(littleEndian: d[0])), dy = Int(Int16(littleEndian: d[1]))
            guard x + w <= W, y + hh <= H, x + dx >= 0, y + dy >= 0, x + dx + w <= W, y + dy + hh <= H else { break loop }
            beginPicture()
            decodeGroup.wait()   // the RECTs before it in this picture are in
            let b = base(back)
            for j in 0..<hh { let r = dy > 0 ? hh - 1 - j : j; memmove(b + (y + dy + r) * BPR + (x + dx) * 4, b + (y + r) * BPR + x * 4, w * 4) }
            dirty.append(Box(x0: x + dx, y0: y + dy, x1: x + dx + w, y1: y + dy + hh))
            if !more && !endPicture(now_us()) { break loop }
        case 9:   // SINK: read, dropped, ECHO
            guard skip(c, len) else { break loop }
            send16(11, 0, Int32(len), Int32(x | y << 16), 0)
        case 10:  // VIDEO
            guard x + w <= W, y + hh <= H, len <= 8 << 20 else { break loop }
            var au = [UInt8](repeating: 0, count: len)
            guard readFull(c, &au, len) else { break loop }
            let t = now_us(), unit = au
            vLock.lock()
            if len == 0 { vgen += 1; vhide = true }
            let gen = vgen
            vLock.unlock()
            if len == 0 { videoQ.async { video.reset(); video.place = (0, 0, 0, 0); send16(1, 10, 0, 0, 0, ack: true) } }
            else { units += 1; videoQ.async { video.unit(x, y, w, hh, unit, t, gen) } }
        default:  // MODE, FULL, CURSOR, POINTER, SET, QUIT: nothing for this screen
            guard skip(c, len) else { break loop }
            if (type == 4 || type == 5) && !more && !endPicture(now_us()) { break loop }
        }
    }
    if back >= 0 { decodeGroup.wait(); IOSurfaceUnlock(surf[back], [], nil); stale[back] = [full]; back = -1 }   // half a picture: never shown
    videoQ.sync { video.reset(); video.place = (0, 0, 0, 0) }
    vLock.lock(); vgen += 1; vLock.unlock()
    DispatchQueue.main.async { videoLayer.isHidden = true; videoLayer.contents = nil; videoShown = nil }
    wire.lock(); client = -1; wire.unlock()
    let d = video.decodeUs.sorted(); video.decodeUs = []
    print(String(format: "sidecar-receiver: the sender left after %.0f s, %d rectangles, %d video units%@", Date().timeIntervalSince(t0), rects, units,
                 d.isEmpty ? "" : String(format: ", video decode %.1f ms median (last byte to picture)", Double(d[d.count / 2]) / 1000)))
}
// --- the sender's sound, on the next port (sidecar-screen --audio, sound.swift): "OK", then "PCM <rate> <channels>" and 16-bit samples,
// played by AVAudioEngine from a ring that starts once 60 ms are in and keeps under 160 ms (what runs ahead goes), as zinc:audio's stream
final class Ring {
    let lock = NSLock(); var buf = [Float](repeating: 0, count: 48000 * 2), head = 0, count = 0, primed = false, ch = 2, rate = 48000
    func put(_ v: UnsafeBufferPointer<Int16>) {
        lock.lock(); defer { lock.unlock() }
        for x in v { if count == buf.count { head = (head + 1) % buf.count; count -= 1 }; buf[(head + count) % buf.count] = Float(x) / 32768; count += 1 }
        let most = rate * ch * 16 / 100, prime = rate * ch * 6 / 100
        if count > most { let d = (count - prime) / ch * ch; head = (head + d) % buf.count; count -= d }
    }
    func take(_ frames: Int, _ out: UnsafeMutableAudioBufferListPointer) {
        lock.lock(); defer { lock.unlock() }
        if !primed && count >= rate * ch * 6 / 100 { primed = true }
        for f in 0..<frames {
            for c in 0..<min(out.count, ch) {
                let p = out[c].mData!.assumingMemoryBound(to: Float.self)
                p[f] = primed && count > 0 ? buf[(head + c) % buf.count] : 0
            }
            if primed && count >= ch { head = (head + ch) % buf.count; count -= ch } else if primed { primed = false }
        }
    }
}
let soundPort = socket(AF_INET, SOCK_STREAM, 0)
setsockopt(soundPort, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
var soundAddr = addr; soundAddr.sin_port = (port + 1).bigEndian
if withUnsafePointer(to: &soundAddr, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(soundPort, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) == 0 && listen(soundPort, 1) == 0 {
    Thread {
        while true {
            let c = accept(soundPort, nil, nil)
            if c < 0 { continue }
            _ = "OK\n".withCString { write(c, $0, 3) }
            var line = [UInt8](), b: UInt8 = 0
            while line.count < 100 && read(c, &b, 1) == 1 && b != 10 { line.append(b) }
            let w = String(decoding: line, as: UTF8.self).split(separator: " ")
            guard w.count == 3, w[0] == "PCM", let rate = Int(w[1]), let ch = Int(w[2]), rate >= 8000, rate <= 192000, ch == 1 || ch == 2 else { close(c); continue }
            let ring = Ring(); ring.rate = rate; ring.ch = ch; ring.buf = [Float](repeating: 0, count: rate * ch)
            let engine = AVAudioEngine()
            let fmt = AVAudioFormat(standardFormatWithSampleRate: Double(rate), channels: AVAudioChannelCount(ch))!
            let node = AVAudioSourceNode(format: fmt) { _, _, frames, list in ring.take(Int(frames), UnsafeMutableAudioBufferListPointer(list)); return noErr }
            engine.attach(node); engine.connect(node, to: engine.mainMixerNode, format: fmt)
            do { try engine.start() } catch { print("sidecar-receiver: no sound output: \(error.localizedDescription)"); close(c); continue }
            print("sidecar-receiver: sound \(rate) Hz, \(ch) channel(s)")
            var raw = [UInt8](repeating: 0, count: 8192), keep = 0
            while true {
                let n = read(c, &raw[keep], raw.count - keep)
                if n <= 0 { break }
                let all = keep + n, whole = all / 2 * 2
                raw.withUnsafeBytes { p in ring.put(UnsafeBufferPointer(start: p.baseAddress!.assumingMemoryBound(to: Int16.self), count: whole / 2)) }
                keep = all - whole; if keep > 0 { raw[0] = raw[whole] }
            }
            engine.stop(); close(c)
        }
    }.start()
}
// senders are taken once the sound's port listens too: a sender that came between the two would find no sound
// one sender at a time, the newest: a connection that died without closing (a cable pulled, a sender killed) would hold the screen for
// ever, so a new sender takes over and the old connection is shut
let free = DispatchSemaphore(value: 1)
Thread {
    while true {
        let c = accept(ls, nil, nil)
        if c < 0 { continue }
        print("sidecar-receiver: a sender connected")
        wire.lock(); if client >= 0 { shutdown(client, SHUT_RDWR) }; wire.unlock()
        free.wait()
        Thread { serve(c); close(c); free.signal() }.start()
    }
}.start()
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    if pictures + videoFrames > 0 { print(String(format: "shown: %.0f pictures/s, %.0f video pictures/s", Double(pictures) / 2, Double(videoFrames) / 2)) }
    pictures = 0; videoFrames = 0
}
#if os(macOS)
app.run()
#else
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(Delegate.self))
#endif
