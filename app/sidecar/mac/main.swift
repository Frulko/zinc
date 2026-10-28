// sidecar: the Mac half of Sidecar (app/sidecar is the tablet's). A virtual display at the tablet's ratio (or a mirrored display) captured by
// ScreenCaptureKit, its luma dithered to 1 bit, and only the 32x16 tiles that changed sent to the tablet's driver (display-rmpp stream.h, TCP 7710),
// one frame in flight: a frame that comes while the tablet works is replaced by the next, never queued.
//   sidecar [--host 10.11.99.1] [--native | --points WxH (Retina; default half the tablet's pixels) | --mirror <display index>] [--threshold] [--idle ms] [--cursor px] [--clean-mode 3|4] [--seconds N]
import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import ApplicationServices

var host = "10.11.99.1", points = (0, 0), native = false, mirror = -1, threshold = false, seconds = 0.0, idleMs = 400, cursorPx = 56, cleanMode = 3
var argv = CommandLine.arguments.dropFirst()
while let a = argv.popFirst() {
    switch a {
    case "--host": host = argv.popFirst()!
    case "--points": let p = argv.popFirst()!.split(separator: "x").map { Int($0)! }; points = (p[0], p[1])
    case "--native": native = true   // 1:1, not Retina: twice the room, everything half as big
    case "--mirror": mirror = Int(argv.popFirst()!)!
    case "--threshold": threshold = true
    case "--cursor": cursorPx = max(19, Int(argv.popFirst()!)!)   // the pointer's height in the tablet's pixels
    case "--clean-mode": cleanMode = Int(argv.popFirst()!)!   // the clean pass's waveform: 3 xochitl's page one, 4 UI
    case "--idle": idleMs = Int(argv.popFirst()!)!   // ms without change before the clean pass; 0: never
    case "--seconds": seconds = Double(argv.popFirst()!)!
    default: fputs("sidecar [--host h] [--native | --points WxH | --mirror n] [--threshold] [--idle ms] [--cursor px] [--clean-mode 3|4] [--seconds N]\n", stderr); exit(2)
    }
}
func die(_ s: String) -> Never { fputs("sidecar: \(s)\n", stderr); exit(1) }
func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }

// --- the tablet
let sock = socket(AF_INET, SOCK_STREAM, 0)
var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = in_port_t(UInt16(ProcessInfo.processInfo.environment["SIDECAR_PORT"] ?? "7710")!).bigEndian
inet_pton(AF_INET, host, &addr.sin_addr)
if withUnsafePointer(to: &addr, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) != 0 {
    die("no tablet at \(host):7710 (open Sidecar on the reMarkable)")
}
var one: Int32 = 1
setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
func readFull(_ p: UnsafeMutableRawPointer, _ n: Int) { var got = 0; while got < n { let r = read(sock, p + got, n - got); if r <= 0 { die("tablet closed") }; got += r } }
func writeFull(_ p: UnsafeRawPointer, _ n: Int) { var put = 0; while put < n { let r = write(sock, p + put, n - put); if r <= 0 { die("tablet closed") }; put += r } }
var line = [UInt8]()
while true { var c: UInt8 = 0; readFull(&c, 1); if c == 10 { break }; line.append(c) }
let hello = String(decoding: line, as: UTF8.self).split(separator: " ")
let W = Int(hello[1])!, H = Int(hello[2])!
print("tablet: \(hello[3...].joined(separator: " ")) \(W)x\(H)")
func header(_ type: UInt8, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ len: Int) -> [UInt8] {
    var b = [UInt8](repeating: 0, count: 16); b[0] = type; b[1] = 1
    for (i, v) in [x, y, w, h].enumerated() { b[2 + i * 2] = UInt8(v & 255); b[3 + i * 2] = UInt8(v >> 8) }
    for i in 0..<4 { b[12 + i] = UInt8((len >> (i * 8)) & 255) }
    return b
}
writeFull(header(2, 0, 0, 0, 0, 0), 16)   // UFAST (mode 0)
if points.0 == 0 { points = native ? (W, H) : (W / 2, H / 2) }   // Retina by default: the tablet's pixels at twice the points

// --- the tablet's messages: answers to RECTs, and its touches and Marker, played on the Mac as the mouse
let acks = DispatchSemaphore(value: 0)
var touchId = -1
func play(_ type: Int, _ id: Int, _ x: Int, _ y: Int, _ pressure: Int) {
    let b = CGDisplayBounds(target), r = region
    let at = CGPoint(x: b.minX + Double(x - r.ox) * b.width / Double(r.fw), y: b.minY + Double(y - r.oy) * b.height / Double(r.fh))
    let pen = type >= 0x20, kind = type & 0x0f, who = pen ? -2 : id
    var t: CGEventType
    switch kind {
    case 0: if touchId != -1 { return }; touchId = who; t = .leftMouseDown
    case 2: if touchId != who { return }; t = .leftMouseDragged
    case 1: if touchId != who { return }; touchId = -1; t = .leftMouseUp
    default: return
    }
    guard let ev = CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: at, mouseButton: .left) else { return }
    if pen { ev.setDoubleValueField(.mouseEventPressure, value: min(1, Double(pressure) / 4096)) }
    ev.post(tap: .cghidEventTap)
}
Thread {
    var m = [UInt8](repeating: 0, count: 16)
    while true {
        readFull(&m, 16)
        let i = { (o: Int) -> Int in Int(Int32(bitPattern: UInt32(m[o]) | UInt32(m[o + 1]) << 8 | UInt32(m[o + 2]) << 16 | UInt32(m[o + 3]) << 24)) }
        if m[0] == 1 { acks.signal() }
        else if m[0] == 2 { let t = Int(m[1]), id = Int(m[2]) | Int(m[3]) << 8, x = i(4), y = i(8), p = i(12); DispatchQueue.main.async { play(t, id, x, y, p) } }
    }
}.start()
if !AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) {
    print("the tablet's touches need the Accessibility permission (System Settings › Privacy & Security › Accessibility) for this terminal")
}

// --- the display
var virtualDisplay: CGVirtualDisplay?   // kept alive: the display goes away with the object
var target: CGDirectDisplayID
if mirror >= 0 {
    var ids = [CGDirectDisplayID](repeating: 0, count: 16); var n: UInt32 = 0
    CGGetActiveDisplayList(16, &ids, &n)
    if mirror >= Int(n) { die("no display \(mirror) (\(n) displays)") }
    target = ids[mirror]
} else {
    let d = CGVirtualDisplayDescriptor()
    d.queue = DispatchQueue.main
    d.name = "reMarkable Paper Pro"
    let room = native ? 1 : 2   // 1:1 gets no room for a larger mode: macOS would pick a scaled one
    d.maxPixelsWide = UInt32(points.0 * room); d.maxPixelsHigh = UInt32(points.1 * room)
    // the panel is 229 ppi; macOS picks its default mode from the density, so 1:1 claims a desktop screen's (110 ppi) to keep its pixels
    let ppi = native ? 110.0 : 229.0
    d.sizeInMillimeters = CGSize(width: Double(W) / ppi * 25.4, height: Double(H) / ppi * 25.4)
    d.vendorID = 0x524D; d.productID = 0x5050; d.serialNum = 1   // macOS 14 needs a non-zero vendor and a serial
    d.terminationHandler = { _, _ in }
    guard let vd = CGVirtualDisplay(descriptor: d) else { die("no virtual display (macOS refused it)") }
    // one mode, the asked one: given several, macOS picks its own and refuses CGDisplaySetDisplayMode on the others (error 1001).
    // HiDPI: the mode is in points, drawn at twice that (Retina); without it, one point is one pixel.
    let s = CGVirtualDisplaySettings(); s.hiDPI = native ? 0 : 1
    s.modes = [CGVirtualDisplayMode(width: UInt(points.0), height: UInt(points.1), refreshRate: 60)]
    if !vd.apply(s) { die("the virtual display refused its mode") }
    virtualDisplay = vd; target = vd.displayID
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        if let m = CGDisplayCopyDisplayMode(target) { print("display \(target): \(m.width)x\(m.height) points, \(m.pixelWidth)x\(m.pixelHeight) pixels") }
    }
}

// --- the clean pass: the fast waveform draws two levels and leaves trails (the pointer's). Once nothing has changed for --idle ms, what
// changed since the last clean goes out again in true greys in the UI waveform, which clears them and shows the anti-aliased text; after
// about four screens of those, a full refresh clears the deeper ghost. AppLoad 0006 switches waveforms in a few ms.
struct Area {
    var x0 = Int.max, y0 = Int.max, x1 = 0, y1 = 0
    var isEmpty: Bool { x1 <= x0 }
    mutating func add(_ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        let a = max(0, x), b = max(0, y), c = min(W, x + w), d = min(H, y + h)
        if c > a && d > b { x0 = min(x0, a); y0 = min(y0, b); x1 = max(x1, c); y1 = max(y1, d) }
    }
    mutating func add(_ o: Area) { if !o.isEmpty { add(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0) } }
}
// The pointer's trail is cleaned on its own, like the eraser's or the pen's: where it was goes out again 150 ms after it stops, and every
// 300 ms while it moves, instead of waiting for the whole screen to rest.
var dirty = Area(), trail = Area(), fastMode = true, cleaned = 0, lastChange = 0.0, lastMove = 0.0, lastTrailClean = 0.0
var grey = [UInt8](repeating: 255, count: 0)
func clean(_ a: Area, _ shown: [UInt8]) {
    let x = a.x0, y = a.y0, w = a.x1 - a.x0, h = a.y1 - a.y0
    writeFull(header(2, cleanMode, 0, 0, 0, 0), 16); fastMode = false   // xochitl's page waveform (3) or UI (4)
    cleaned += w * h
    if cleaned > W * H * 4 { writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0; return }   // the full refresh repaints everything
    var payload = [UInt8](repeating: 0, count: w * h)
    for j in 0..<h { let o = (y + j) * W + x; payload.replaceSubrange(j * w..<(j + 1) * w, with: shown[o..<(o + w)]) }
    var hd = header(1, x, y, w, h, payload.count); hd[1] = 8
    writeFull(hd, 16); writeFull(payload, payload.count)
    acks.wait()
}

// --- the sender: the newest frame only, one frame in flight
let stride = (W + 7) / 8
grey = [UInt8](repeating: 255, count: W * H)
var prev = [UInt8](repeating: 0, count: stride * H)   // what the tablet shows: white (bit 0) after the probe's clear
var cur = prev
let lock = NSLock(), ready = DispatchSemaphore(value: 0)
var latest: CVPixelBuffer?
let bayer: [UInt8] = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
                      3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
let thr: [UInt8] = threshold ? [UInt8](repeating: 128, count: 64) : bayer.map { UInt8(Int($0) * 4 + 2) }
var stats = (frames: 0, rects: 0, bytes: 0, dither: 0.0, wait: 0.0, t: now())

// --- the pointer: drawn here, not captured: bigger than macOS's, black with a white edge, and it moves without a new frame of the screen
// (a pointer that only moves sends just the tiles it leaves and enters)
let arrow: [(Double, Double)] = [(0, 0), (0, 16), (4, 12.3), (7, 19), (9.2, 18), (6.3, 11.3), (11.5, 11.3)]   // 19 units tall, tip at (0, 0)
var pointer: (x: Int, y: Int)? = nil   // in the tablet's pixels, nil off the display
var region = (ox: 0, oy: 0, fw: W, fh: H)   // where the captured frame lands on the tablet
func inside(_ px: Double, _ py: Double) -> Bool {
    var c = false
    for i in 0..<arrow.count {
        let (xi, yi) = arrow[i], (xj, yj) = arrow[(i + arrow.count - 1) % arrow.count]
        if (yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi { c.toggle() }
    }
    return c
}
// the arrow's mask at --cursor pixels tall: 2 black, 1 its white edge, 0 outside
let pointerMask: (w: Int, h: Int, m: [UInt8]) = {
    let k = Double(cursorPx) / 19, e = max(2, cursorPx / 16), w = Int(12 * k) + 2 * e, h = cursorPx + 2 * e
    var m = [UInt8](repeating: 0, count: w * h)
    for y in 0..<h { for x in 0..<w where inside((Double(x - e) + 0.5) / k, (Double(y - e) + 0.5) / k) { m[y * w + x] = 2 } }
    var out = m
    for y in 0..<h { for x in 0..<w where m[y * w + x] == 0 {
        var near = false
        for dy in -e...e where !near { for dx in -e...e where dx * dx + dy * dy <= e * e { let xx = x + dx, yy = y + dy
            if xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] == 2 { near = true; break } } }
        if near { out[y * w + x] = 1 }
    } }
    return (w, h, out)
}()
func pointerNow() -> (x: Int, y: Int)? {
    guard let loc = CGEvent(source: nil)?.location else { return nil }
    let b = CGDisplayBounds(target)
    guard b.contains(loc) else { return nil }
    return (region.ox + Int((loc.x - b.minX) * Double(region.fw) / b.width), region.oy + Int((loc.y - b.minY) * Double(region.fh) / b.height))
}
var pointerMoved = false
let pointerTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
pointerTimer.schedule(deadline: .now(), repeating: .milliseconds(16))
pointerTimer.setEventHandler {
    let p = pointerNow()
    if p?.x != pointer?.x || p?.y != pointer?.y { lock.lock(); pointer = p; pointerMoved = true; lock.unlock(); ready.signal() }
}
pointerTimer.resume()

Thread {
    var shown = [UInt8](repeating: 255, count: W * H)   // the screen as the tablet should show it: the capture with the pointer
    var drawn: (x: Int, y: Int)? = nil                   // where the pointer was drawn last
    while true {
        if (idleMs > 0 && !dirty.isEmpty) || !trail.isEmpty { _ = ready.wait(timeout: .now() + .milliseconds(30)) } else { ready.wait() }
        let tw0 = now()
        if idleMs > 0 && !dirty.isEmpty && tw0 - lastChange >= Double(idleMs) {
            dirty.add(trail); clean(dirty, shown); dirty = Area(); trail = Area()
        } else if !trail.isEmpty && (tw0 - lastMove >= 150 || tw0 - lastTrailClean >= 300) {
            clean(trail, shown); trail = Area(); lastTrailClean = tw0
        }
        lock.lock(); let pb = latest; latest = nil; let moved = pointerMoved; pointerMoved = false; let p = pointer; lock.unlock()
        if pb == nil && !moved { continue }
        let t0 = now()
        if let pb {   // the new frame's luma into grey, at its place on the panel
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            let fw = min(CVPixelBufferGetWidthOfPlane(pb, 0), W), fh = min(CVPixelBufferGetHeightOfPlane(pb, 0), H), bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
            region = ((W - fw) / 2 / 8 * 8, (H - fh) / 2, fw, fh)
            let src = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
            grey.withUnsafeMutableBufferPointer { g in for y in 0..<fh { _ = memcpy(g.baseAddress! + (y + region.oy) * W + region.ox, src + y * bpr, fw) } }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        shown = grey
        let pm = pointerMask, e = max(2, cursorPx / 16)
        if let d = drawn, d.x != p?.x || d.y != p?.y { trail.add(d.x - e, d.y - e, pm.w, pm.h); lastMove = now() }   // where it was
        drawn = p
        if let p {
            for y in 0..<pm.h { let yy = p.y - e + y; if yy < 0 || yy >= H { continue }
                for x in 0..<pm.w where pm.m[y * pm.w + x] != 0 { let xx = p.x - e + x; if xx >= 0 && xx < W { shown[yy * W + xx] = pm.m[y * pm.w + x] == 2 ? 0 : 255 } } }
        }
        cur.withUnsafeMutableBufferPointer { c in
            thr.withUnsafeBufferPointer { t in
                shown.withUnsafeBufferPointer { g in
                    for y in 0..<H {
                        let row = g.baseAddress! + y * W, out = c.baseAddress! + y * stride, tr = t.baseAddress! + (y & 7) * 8
                        var x = 0
                        while x < W {
                            var b: UInt8 = 0
                            for i in 0..<min(8, W - x) where row[x + i] < tr[i] { b |= 0x80 >> UInt8(i) }
                            out[x >> 3] = b; x += 8
                        }
                    }
                }
            }
        }
        let t1 = now()
        // changed tiles, 32x16: per band of 16 rows the span of changed columns; bands merged while that wastes little
        var rects: [(Int, Int, Int, Int)] = []
        let tw = 4, th = 16
        for by in Swift.stride(from: 0, to: H, by: th) {
            let bh = min(th, H - by)
            var lo = Int.max, hi = -1
            for tx in Swift.stride(from: 0, to: stride, by: tw) {
                let te = min(tx + tw, stride)
                var diff = false
                for y in by..<(by + bh) where !diff { let o = y * stride; for i in tx..<te where cur[o + i] != prev[o + i] { diff = true; break } }
                if diff { lo = min(lo, tx); hi = max(hi, te) }
            }
            guard hi >= 0 else { continue }
            if var r = rects.last, r.1 + r.3 == by {
                let ux0 = min(r.0, lo * 8), ux1 = max(r.0 + r.2, min(hi * 8, W))
                if (ux1 - ux0) * (r.3 + bh) <= (r.2 * r.3 + (min(hi * 8, W) - lo * 8) * bh) * 13 / 10 {
                    r = (ux0, r.1, ux1 - ux0, r.3 + bh); rects[rects.count - 1] = r; continue
                }
            }
            rects.append((lo * 8, by, min(hi * 8, W) - lo * 8, bh))
        }
        if !rects.isEmpty { lastChange = now() }
        if !rects.isEmpty && fastMode == false { writeFull(header(2, 0, 0, 0, 0, 0), 16); fastMode = true }   // moving again: the pen's waveform
        for (x, y, w, h) in rects {
            dirty.add(x, y, w, h)
            let rs = (w + 7) / 8
            var payload = [UInt8](repeating: 0, count: rs * h)
            for j in 0..<h { let o = (y + j) * stride + x / 8; payload.replaceSubrange(j * rs..<(j + 1) * rs, with: cur[o..<(o + rs)]) }
            writeFull(header(1, x, y, w, h, payload.count), 16); writeFull(payload, payload.count)
            stats.bytes += payload.count + 16
        }
        let t2 = now()
        for _ in rects { acks.wait() }
        swap(&prev, &cur)
        cur = prev
        stats.frames += 1; stats.rects += rects.count; stats.dither += t1 - t0; stats.wait += now() - t2
        if now() - stats.t >= 2000 {
            let f = max(stats.frames, 1)
            print(String(format: "%5.1f frames/s  %4.1f rects/frame  %6.0f KB/s  dither+diff %4.1f ms  tablet %4.1f ms", Double(stats.frames) / (now() - stats.t) * 1000,
                         Double(stats.rects) / Double(f), Double(stats.bytes) / (now() - stats.t), stats.dither / Double(f), stats.wait / Double(f)))
            stats = (0, 0, 0, 0, 0, now())
        }
    }
}.start()

// --- the capture
final class Out: NSObject, SCStreamOutput, SCStreamDelegate {
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let pb = sb.imageBuffer,
              let info = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
        lock.lock(); latest = pb; lock.unlock(); ready.signal()
    }
    func stream(_ s: SCStream, didStopWithError e: Error) { die("capture stopped: \(e.localizedDescription)") }
}
let out = Out()
var stream: SCStream?
func startCapture(_ tries: Int) {
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, err in
        guard let display = content?.displays.first(where: { $0.displayID == target }) else {
            if tries > 20 { die("display not shareable: \(err?.localizedDescription ?? "not found") (Screen Recording permission?)") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { startCapture(tries + 1) }; return
        }
        let c = SCStreamConfiguration()
        // the panel's pixels, the display's aspect kept (a mirrored display gets white bands)
        let k = min(Double(W) / Double(display.width), Double(H) / Double(display.height))
        c.width = Int(Double(display.width) * k); c.height = Int(Double(display.height) * k)
        c.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarFullRange   // plane 0 is the luma: grey with no conversion
        c.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        c.queueDepth = 3
        c.showsCursor = false   // drawn by the sender (the pointer above)
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: c, delegate: out)
        do { try s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture")) } catch { die("\(error)") }
        s.startCapture { e in if let e { die("capture: \(e.localizedDescription)") }; print("capturing \(c.width)x\(c.height)") }
        stream = s
    }
}
startCapture(0)
if seconds > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { writeFull(header(3, 0, 0, 0, 0, 0), 16); exit(0) } }
signal(SIGINT) { _ in exit(0) }
dispatchMain()
