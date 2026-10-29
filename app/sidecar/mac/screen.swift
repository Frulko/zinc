// sidecar-screen: the Mac half of Sidecar for a colour screen with a network (a Raspberry Pi on HDMI running app/sidecar-screen, the
// receiver of display-fbdev, plugins/display-rmpp/stream.h). A virtual display the receiver's size (or a mirrored one) captured in BGRA;
// the 64-pixel tiles that changed since what the receiver shows, joined in runs along a row, each run filtered (PNG's Sub) and compressed
// (zstd 1, else lz4) on every core at once, sent as RECTs of one picture. At most two pictures wait for the receiver's ACKs: a newer
// capture replaces the one waiting, so the screen never lags behind the network.
// A picture where much of the screen changes (a video, a page switch), or that comes while the link is still busy, goes rough: its colours
// cut to 5-6-5 bits (half the bytes after zstd on a desktop, codecbench), nothing new for the receiver to decode; each rough tile is sent
// again exact once it has rested 300 ms.
// A part of the screen that changes at nearly every picture (a film, a game) goes as H.264 when the receiver has a hardware decoder
// (+h264): VideoToolbox here, the decoder and a display plane there; the rest stays exact tiles.
//   sidecar-screen --host <address> [--port 7710] [--mirror <display>] [--hidpi] [--lz4] [--exact] [--no-video] [--audio] [--seconds n] [--synthetic <percent>]
import Foundation
import ScreenCaptureKit
import CoreMedia
import SystemConfiguration

setvbuf(stdout, nil, _IOLBF, 0)
func die(_ s: String) -> Never { print("sidecar-screen: \(s)"); exit(1) }
var host = "", port: UInt16 = 7710, mirror = -1, hidpi = false, forceLz4 = false, seconds = 0.0, exact = false, synthetic = 0
var h264Dump = "", noVideo = false, audio = false
var argv = Array(CommandLine.arguments.dropFirst())
while !argv.isEmpty {
    let a = argv.removeFirst()
    switch a {
    case "--host": host = argv.removeFirst()
    case "--port": port = UInt16(argv.removeFirst())!
    case "--mirror": mirror = Int(argv.removeFirst())!
    case "--hidpi": hidpi = true      // the virtual display at half the receiver's size in points, drawn at twice (Retina): bigger text
    case "--lz4": forceLz4 = true     // lz4 even when the receiver reads zstd: less ratio, less of its CPU
    case "--seconds": seconds = Double(argv.removeFirst())!
    case "--exact": exact = true      // never rough: every picture exact, whatever it costs
    case "--no-video": noVideo = true // no H.264 region, even when the receiver decodes it: every pixel exact or rough tiles
    case "--audio": audio = true      // the Mac's sound on the screen when it can play it (sound.swift), the Mac muted meanwhile
    case "--h264-dump": h264Dump = argv.removeFirst()   // no screen: the synthetic load as H.264 into this file for --seconds (Annex B; the
                                                           // receiver's decoder is proved on it, tools/v4l2dec-probe.cpp)
    case "--synthetic": synthetic = Int(argv.removeFirst())!   // no capture: a still page with a moving "video" over this percent of it, 60 a second (a
                                                                 // load that is the same from run to run, to compare the links and the receivers)
    default: die("unknown option \(a)")
    }
}
/** The synthetic load's picture n into a BGRA buffer of w x h: a light page with lines of "text", and a block of `percent` of it whose
 *  colours flow every frame like a film (smooth gradients that move, so they compress as a video's pictures do, not as noise). */
func drawSynthetic(_ pb: CVPixelBuffer, _ n: Int, _ w: Int, _ h: Int, _ percent: Int) {
    let side = (Double(percent) / 100).squareRoot(), bw = Int(Double(w) * side), bh = Int(Double(h) * side), bx = (w - bw) / 2, by = (h - bh) / 2
    CVPixelBufferLockBaseAddress(pb, [])
    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self), bpr = CVPixelBufferGetBytesPerRow(pb)
    for y in 0..<h {
        let row = base + y * bpr
        let text = y % 24 < 12 && (y / 24) % 3 != 2
        for x in 0..<w { let v: UInt8 = text && x % 18 < 9 && x > 40 && x < w - 40 ? 60 : 240; row[x * 4] = v; row[x * 4 + 1] = v; row[x * 4 + 2] = v; row[x * 4 + 3] = 255 }
        if y >= by && y < by + bh {
            for x in bx..<(bx + bw) {
                let p = row + x * 4, t = n * 3
                p[0] = UInt8(truncatingIfNeeded: (x + t) / 3); p[1] = UInt8(truncatingIfNeeded: (y * 2 + t) / 4); p[2] = UInt8(truncatingIfNeeded: (x + y - t) / 5)
            }
        }
    }
    CVPixelBufferUnlockBaseAddress(pb, [])
}
if !h264Dump.isEmpty {
    let w = 1920, h = 1080, frames = Int((seconds > 0 ? seconds : 5) * 60)
    guard let enc = VideoEncoder(w: w, h: h, bitrate: 10_000_000) else { die("VideoToolbox refused the H.264 session") }
    FileManager.default.createFile(atPath: h264Dump, contents: nil)
    let f = FileHandle(forWritingAtPath: h264Dump)!
    var pb: CVPixelBuffer?
    CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32BGRA, nil, &pb)
    var total = 0, keys = 0, ms = [Double](), sizes = ""   // <file>.sizes: each access unit's bytes, one a line
    for i in 0..<frames {
        drawSynthetic(pb!, i, w, h, max(synthetic, 25))
        let t = CFAbsoluteTimeGetCurrent()
        guard let (d, key) = enc.encode(pb!, x: 0, y: 0) else { die("no H.264 picture \(i)") }
        ms.append((CFAbsoluteTimeGetCurrent() - t) * 1000)
        f.write(Data(d)); total += d.count; keys += key ? 1 : 0; sizes += "\(d.count)\n"
    }
    try? sizes.write(toFile: h264Dump + ".sizes", atomically: true, encoding: .utf8)
    ms.sort()
    print(String(format: "h264: %d pictures %dx%d, %.1f Mbit/s at 60, %d key, encode %.1f ms median %.1f max, low-latency rate control %@",
                 frames, w, h, Double(total) * 8 / Double(frames) * 60 / 1e6, keys, ms[ms.count / 2], ms.last!, enc.lowLatency ? "on" : "off"))
    exit(0)
}
if host.isEmpty { die("--host <the screen's address> is needed (app/sidecar-screen shows it)") }

// --- the connection: the receiver says "RMPP <w> <h> <model> +caps..."
var sock: Int32 = -1
var tried = [String]()   // each address of the screen and whether it answered (the details' Diagnostics)
/** A connected socket to one of the name's IPv4 addresses, each tried for 0.8 s: a Pi on a USB cable announces both of its links
 *  (usb0, usb1) and only the one the Mac's active NCM function reaches answers, so the first address may never connect. */
func dial() -> Int32 {
    var addrs = [in_addr]()
    var one = in_addr()
    if inet_pton(AF_INET, host, &one) == 1 { addrs = [one] } else {
        var res: UnsafeMutablePointer<addrinfo>?; var hints = addrinfo(); hints.ai_family = AF_INET; hints.ai_socktype = SOCK_STREAM
        if getaddrinfo(host, nil, &hints, &res) == 0 {
            var r = res
            while let i = r?.pointee { addrs.append(i.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }); r = i.ai_next }
            freeaddrinfo(res)
        }
    }
    // a cable first (Ethernet or USB, 169.254/16), then the rest in the resolver's order
    addrs = addrs.filter { UInt32(bigEndian: $0.s_addr) >> 16 == 0xA9FE } + addrs.filter { UInt32(bigEndian: $0.s_addr) >> 16 != 0xA9FE }
    for ip in addrs {
        let s = socket(AF_INET, SOCK_STREAM, 0)
        var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = port.bigEndian; a.sin_addr = ip
        let flags = fcntl(s, F_GETFL); _ = fcntl(s, F_SETFL, flags | O_NONBLOCK)
        let r = withUnsafePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        var ok = r == 0
        if !ok && errno == EINPROGRESS {
            var p = pollfd(fd: s, events: Int16(POLLOUT), revents: 0)
            var err: Int32 = 0, n = socklen_t(MemoryLayout<Int32>.size)
            ok = poll(&p, 1, 800) == 1 && getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &n) == 0 && err == 0
        }
        var t = [CChar](repeating: 0, count: 64); var ipv = ip; inet_ntop(AF_INET, &ipv, &t, 64)
        tried.append(String(cString: t) + (ok ? " answers" : " no answer"))
        if ok { _ = fcntl(s, F_SETFL, flags); return s }
        close(s)
    }
    return -1
}
for tries in 0... {
    tried = []
    sock = dial()
    if sock >= 0 { break }
    if tries == 0 { print("waiting for the screen at \(host):\(port) (open Sidecar Screen on it)") }
    usleep(500_000)
}
var one: Int32 = 1
setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
func readFull(_ p: UnsafeMutableRawPointer, _ n: Int) { var got = 0; while got < n { let r = read(sock, p + got, n - got); if r < 0 && errno == EINTR { continue }; if r <= 0 { die("the screen went away") }; got += r } }
let wire = NSLock()   // one message at a time on the socket: a picture's RECTs, a video's unit (from VideoToolbox's thread), a stop
func writeFull(_ p: UnsafeRawPointer, _ n: Int) { var put = 0; while put < n { let r = write(sock, p + put, n - put); if r < 0 && errno == EINTR { continue }; if r <= 0 { die("the screen went away") }; put += r } }
var line = [UInt8]()
while true { var c: UInt8 = 0; readFull(&c, 1); if c == 10 { break }; line.append(c) }
let words = String(decoding: line, as: UTF8.self).split(separator: " ").map(String.init)
let caps = Set(words.filter { $0.hasPrefix("+") }.map { String($0.dropFirst()) })
let W = words.count >= 4 ? Int(words[1]) ?? 0 : 0, H = words.count >= 4 ? Int(words[2]) ?? 0 : 0
if W <= 0 || H <= 0 || !caps.contains("rgb") { die("not a colour screen: \(words.joined(separator: " "))") }
let zstd = caps.contains("zstd") && !forceLz4, sub = caps.contains("sub")
print("screen: \(words[3...].filter { !$0.hasPrefix("+") }.joined(separator: " ")) \(W)x\(H), \(zstd ? "zstd" : "lz4")\(sub ? " + Sub" : "")")

// --- the sound (sound.swift): the screen's app answers on the next port "OK" when it has a sound output, so the tray offers the option
// ("sound: available"); with --audio the Mac's sound goes there as 16-bit PCM (1.5 Mbit/s at 48 kHz) on that connection of its own
var soundState = "off", soundSock: Int32 = -1
let tapper = SoundTap()
do {
    var sa = sockaddr_in(), n = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &sa) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getpeername(sock, $0, &n) } }
    sa.sin_port = (port + 1).bigEndian
    let s = socket(AF_INET, SOCK_STREAM, 0)
    var tv = timeval(tv_sec: 1, tv_usec: 0)
    setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    var answer = [UInt8]()
    if withUnsafePointer(to: &sa, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, n) } }) == 0 {
        var c: UInt8 = 0
        while answer.count < 200 && read(s, &c, 1) == 1 && c != 10 { answer.append(c) }
    }
    let a = String(decoding: answer, as: UTF8.self)
    if a == "OK" {
        print("sound: available")
        if audio {
            soundSock = s
            setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
            let sq = DispatchQueue(label: "sound")
            var queued = 0   // bytes handed to sq and not written yet: past 100 ms of sound (a stalled link) a buffer is dropped
            let lock = NSLock()
            if let why = tapper.start({ b in
                let d = Data(buffer: b), most = Int(tapper.rate) * tapper.channels * 2 / 10
                lock.lock(); let skip = queued > most; if !skip { queued += d.count }; lock.unlock()
                if skip { return }
                sq.async {
                    d.withUnsafeBytes { p in var put = 0; while put < d.count { let r = write(s, p.baseAddress! + put, d.count - put); if r <= 0 { break }; put += r } }
                    lock.lock(); queued -= d.count; lock.unlock()
                }
            }) {
                soundState = "off: " + why; print("sound: none (\(why))")
            } else {
                let head = "PCM \(Int(tapper.rate)) \(tapper.channels)\n"
                _ = head.withCString { write(s, $0, strlen($0)) }
                soundState = "on, \(Int(tapper.rate)) Hz \(tapper.channels == 2 ? "stereo" : "mono"), 16-bit (\(Int(tapper.rate) * tapper.channels * 16 / 1000) kbit/s); the Mac's own output is muted meanwhile"
                print("sound: on")
            }
        } else { close(s); soundState = "off (the screen can play it: Sound in Sidecar's settings)" }
    } else {
        close(s)
        let why = a.hasPrefix("NO ") ? String(a.dropFirst(3)) : "this screen's app is too old for sound: update it"
        soundState = "none: " + why; print("sound: none (\(why))")
    }
}

func header(_ type: UInt8, _ depth: UInt8, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ codec: UInt8, _ more: Bool, _ len: Int) -> [UInt8] {
    var b = [UInt8](repeating: 0, count: 16)
    b[0] = type; b[1] = depth
    for (i, v) in [x, y, w, h].enumerated() { b[2 + i * 2] = UInt8(v & 255); b[3 + i * 2] = UInt8(v >> 8 & 255) }
    b[10] = codec; b[11] = more ? 1 : 0
    for i in 0..<4 { b[12 + i] = UInt8(len >> (8 * i) & 255) }
    return b
}

// --- the display
var virtualDisplay: CGVirtualDisplay?
var target: CGDirectDisplayID = 0
if synthetic > 0 {   // nothing captured, nothing to show on the Mac
} else if mirror >= 0 {
    var ids = [CGDirectDisplayID](repeating: 0, count: 16); var n: UInt32 = 0
    CGGetActiveDisplayList(16, &ids, &n)
    if mirror >= Int(n) { die("no display \(mirror) (\(n) displays)") }
    target = ids[mirror]
} else {
    let d = CGVirtualDisplayDescriptor()
    d.queue = DispatchQueue.main
    d.name = "Sidecar Screen"
    d.maxPixelsWide = UInt32(W); d.maxPixelsHigh = UInt32(H)
    d.sizeInMillimeters = CGSize(width: Double(W) / 92 * 25.4, height: Double(H) / 92 * 25.4)   // a 24" 1080p monitor's density
    d.vendorID = 0x5A4E; d.productID = 0x5343; d.serialNum = 1
    d.terminationHandler = { _, _ in }
    guard let vd = CGVirtualDisplay(descriptor: d) else { die("no virtual display (macOS refused it)") }
    virtualDisplay = vd; target = vd.displayID
    let s = CGVirtualDisplaySettings(); s.hiDPI = hidpi ? 1 : 0
    let (pw, ph) = hidpi ? (W / 2, H / 2) : (W, H)
    s.modes = [CGVirtualDisplayMode(width: UInt(pw), height: UInt(ph), refreshRate: 60)]
    if !vd.apply(s) { die("the virtual display refused its mode") }
}

// --- what the receiver shows (BGRA, as captured): a tile is sent when it differs from it
let T = 64, TX = (W + T - 1) / T, TY = (H + T - 1) / T
var shown = [UInt8](repeating: 0, count: W * H * 4)
var first = true
struct Run { let x: Int, y: Int, w: Int, h: Int; var rough = false; var payload = [UInt8](); var codec: UInt8 = 0 }
var roughAt = [Double](repeating: 0, count: TX * TY)   // when a tile went rough (0: exact on the receiver)
var last: CVPixelBuffer?                              // the newest capture, to send rough tiles again exact once they rest
let workers = ProcessInfo.processInfo.activeProcessorCount
let zctx = (0..<max(workers, 1)).map { _ in ZSTD_createCCtx() }   // one per worker

/** The run's pixels from the capture, as B, G, R rows, Sub-filtered and compressed. */
func encode(_ r: inout Run, _ base: UnsafePointer<UInt8>, _ bpr: Int, _ ctx: OpaquePointer?) {
    let stride = r.w * 3
    var raw = [UInt8](repeating: 0, count: stride * r.h)
    raw.withUnsafeMutableBufferPointer { o in
        for j in 0..<r.h {
            let p = base + (r.y + j) * bpr + r.x * 4, q = o.baseAddress! + j * stride
            if r.rough { for i in 0..<r.w { q[i * 3] = p[i * 4] & 0xF8; q[i * 3 + 1] = p[i * 4 + 1] & 0xFC; q[i * 3 + 2] = p[i * 4 + 2] & 0xF8 } }
            else { for i in 0..<r.w { q[i * 3] = p[i * 4]; q[i * 3 + 1] = p[i * 4 + 1]; q[i * 3 + 2] = p[i * 4 + 2] } }
            if sub { var i = stride - 1; while i >= 3 { q[i] = q[i] &- q[i - 3]; i -= 1 } }
        }
    }
    var out = [UInt8](repeating: 0, count: zstd ? ZSTD_compressBound(raw.count) : Int(LZ4_compressBound(Int32(raw.count))))
    let n = zstd ? ZSTD_compressCCtx(ctx, &out, out.count, raw, raw.count, 1) : Int(LZ4_compress_default(raw, &out, Int32(raw.count), Int32(out.count)))
    if n > 0 && n < raw.count && ZSTD_isError(n) == 0 { out.removeSubrange(n...); r.payload = out; r.codec = (zstd ? 2 : 1) | (sub ? 0x80 : 0) }
    else { r.payload = raw; r.codec = sub ? 0x80 : 0 }
}

// --- the video: tiles that changed in most of the last pictures, as one rectangle that holds them densely, steady for 10 pictures, become
// an H.264 region; a second without a change there (a pause) or a new rectangle (the window moved) ends it, and its tiles go again exact
let h264 = caps.contains("h264") && !noVideo
struct Area: Equatable { var x0 = 0, y0 = 0, x1 = 0, y1 = 0 }   // in tiles
var busy = [Float](repeating: 0, count: TX * TY)   // how often each tile changed lately (0..1)
// VideoToolbox's first session in a process takes 0.4 s to make (1.4 s while the tiles keep the cores busy) and its first pictures 100 ms:
// paid here, on another thread, at the start, so a film's encoder is ready in 2 ms instead of freezing the stream when it comes
if h264 { DispatchQueue.global(qos: .userInitiated).async {
    var pb: CVPixelBuffer?
    CVPixelBufferCreate(nil, 256, 144, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pb)
    if let pb, let e = VideoEncoder(w: 256, h: 144, bitrate: 1_000_000) { for _ in 0..<3 { _ = e.encode(pb, x: 0, y: 0) } }
} }
var video: Area?, encoder: VideoEncoder?
var candidate: Area?, steady = 0, still = 0, starting = false, making = false
var videoStats = (frames: 0, bytes: 0, encode: 0.0)
var videoDecodeUs = [Int]()   // the screen's decoder: µs from a unit's last byte to its picture
/** The rectangle of the busy tiles when they fill most of it and it is large enough to be a film (12 tiles: 256 x 192 pixels). */
func busyArea() -> Area? {
    var a = Area(x0: TX, y0: TY, x1: 0, y1: 0), n = 0
    for ty in 0..<TY { for tx in 0..<TX where busy[ty * TX + tx] > 0.3 { a.x0 = min(a.x0, tx); a.y0 = min(a.y0, ty); a.x1 = max(a.x1, tx + 1); a.y1 = max(a.y1, ty + 1); n += 1 } }
    return n >= 12 && n * 10 >= (a.x1 - a.x0) * (a.y1 - a.y0) * 6 ? a : nil
}
func pixels(_ a: Area, _ w: Int, _ h: Int) -> (x: Int, y: Int, w: Int, h: Int) { (a.x0 * T, a.y0 * T, min(a.x1 * T, w) - a.x0 * T, min(a.y1 * T, h) - a.y0 * T) }

// --- pacing: the ACKs of each picture's last RECT; at most two pictures out, the newest capture waits for a free place
let q = DispatchQueue(label: "send")
var rectsSent = 0, rectsAcked = 0, frameEnds = [(Int, Double)]()   // the rect count at each picture's end, and when it went
var waiting: CVPixelBuffer?
var stats = (frames: 0, bytes: 0, raw: 0, encode: 0.0, rtt: [Double](), tiles: 0, rough: 0)
// the details panel's counters: captures that came and were replaced before going, the receiver's decode time, the slowest encode
var more = (captured: 0, dropped: 0, decodeUs: 0, encodeMax: 0.0, idle: 0)
var shownUs = [Int](), pictureUs = [Int]()   // SHOWN: µs from a picture's last byte to its commit on the screen (a screen that flips)
var rx = [[Int]](repeating: [-1, -1, -1], count: 3)   // the screen's HOST messages, by type
var total = (bytes: 0, frames: 0)
let began = CFAbsoluteTimeGetCurrent()
func now() -> Double { CFAbsoluteTimeGetCurrent() }
Thread {
    var m = [UInt8](repeating: 0, count: 16)
    while true {
        readFull(&m, 16)
        let b = Int(Int32(littleEndian: m.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 8, as: Int32.self) }))
        if m[0] == 10 && m[1] < 3 { let a = Int(Int32(littleEndian: m.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: Int32.self) })),
                                        c = Int(Int32(littleEndian: m.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 12, as: Int32.self) })), k = Int(m[1])
                                    q.async { rx[k] = [a, b, c] } }
        if m[0] == 11 { echoes.signal() }
        if m[0] == 12 { let a = Int(Int32(littleEndian: m.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: Int32.self) })); q.async { shownUs.append(a); if b > 0 { pictureUs.append(b) } } }
        if m[0] == 1 { let video = m[1] == 10; q.async { rectsAcked += 1; if video { if b > 0 { videoDecodeUs.append(b) } } else { more.decodeUs += b }
            while let f = frameEnds.first, f.0 <= rectsAcked {
                stats.rtt.append((now() - f.1) * 1000); frameEnds.removeFirst()
                if trace && traced < 40 { traced += 1; print(String(format: "trace: picture at %.3f s back after %.1f ms, %d in flight of %d, video %@", f.1 - began, (now() - f.1) * 1000, frameEnds.count, inFlight, video == nil ? "no" : "yes")) }
            }
            pump() } }
    }
}.start()

// two pictures out while one comes back within a refresh (decode overlaps transfer); one when the round trip is longer, so a picture
// waits here, where a newer capture replaces it, rather than in the socket
var inFlight = 2, lastRtt = 0.0
let trace = ProcessInfo.processInfo.environment["SIDECAR_TRACE"] != nil   // the first pictures' round trips, one a line
var traced = 0
/** The pictures out at once, from the last round trip and the film (set at once when one starts or ends, not at the next 2 s). */
func pace() {
    let big = video.map { v in (v.x1 - v.x0) * (v.y1 - v.y0) * 2 >= TX * TY } ?? false
    inFlight = video != nil ? (big ? 4 : 3) : lastRtt > 17 ? 1 : 2
}
func pump() {
    guard frameEnds.count < inFlight, let pb = waiting else { return }
    waiting = nil
    send(pb)
}

func send(_ pb: CVPixelBuffer) {
    CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = min(W, CVPixelBufferGetWidth(pb)), h = min(H, CVPixelBufferGetHeight(pb)), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = UnsafePointer(CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self))
    let t0 = now()
    // the video's start or end, from the pictures before this one
    if h264 {
        let c = busyArea()
        if c == candidate { steady += 1 } else { candidate = c; steady = 0 }
        // a film's dark or still parts change fewer tiles: a rectangle inside the video's is the same film. Only one that goes out of it
        // (the window moved or grew) for half a second, or a second without a change (a pause), ends it
        let outside = c.map { c in c.x0 < video?.x0 ?? 0 || c.y0 < video?.y0 ?? 0 || c.x1 > video?.x1 ?? 0 || c.y1 > video?.y1 ?? 0 } ?? false
        if let v = video, still > 60 || (steady >= 30 && outside) {   // over: its place is sent again exact, below
            let r = pixels(v, w, h)
            encoder?.flush()   // its units are on the wire before the stop
            wire.lock(); writeFull(header(10, 0, r.x, r.y, r.w, r.h, 0, false, 0), 16); wire.unlock(); rectsSent += 1
            shown.withUnsafeMutableBufferPointer { s in for y in r.y..<(r.y + r.h) { for x in r.x..<(r.x + r.w) { s[(y * W + x) * 4 + 3] = 0 } } }   // differs from any capture
            video = nil; encoder = nil
            print("video: off (\(still > 60 ? "still" : "moved"))"); pace()
        }
        if video == nil, !making, steady >= 10, let c {
            // made on another thread (the first one of a process can take 0.4 s or more): the film goes on as tiles until it is ready
            let r = pixels(c, w, h), tc = now()
            making = true
            DispatchQueue.global(qos: .userInitiated).async {
                let e = VideoEncoder(w: r.w, h: r.h, bitrate: r.w * r.h * 6)   // ~0.1 bit a pixel at 60
                q.async {
                    making = false
                    if trace { print(String(format: "trace: encoder made in %.1f ms", (now() - tc) * 1000)) }
                    guard let e, candidate == c, video == nil else { if e == nil { candidate = nil }; return }
                    // this picture's tiles go too: the screen shows them until the decoder's first picture is out
                    video = c; encoder = e; still = 0; starting = true; pace(); print("video: on \(r.w)x\(r.h) at \(r.x),\(r.y)")
                }
            }
        }
    }
    // each tile: 0 as the receiver has it, 1 changed, 2 rough there and rested (sent again exact)
    var state = [UInt8](repeating: 0, count: TX * TY), changedPx = 0
    shown.withUnsafeMutableBufferPointer { s in
        for ty in 0..<TY { for tx in 0..<TX {
            let x0 = tx * T, y0 = ty * T, tw = min(T, w - x0), th = min(T, h - y0)
            guard tw > 0 && th > 0 else { continue }
            var changed = first
            for y in y0..<(y0 + th) where !changed { changed = memcmp(base + y * bpr + x0 * 4, s.baseAddress! + (y * W + x0) * 4, tw * 4) != 0 }
            if changed { for y in y0..<(y0 + th) { memcpy(s.baseAddress! + (y * W + x0) * 4, base + y * bpr + x0 * 4, tw * 4) }; state[ty * TX + tx] = 1; changedPx += tw * th }
            else if roughAt[ty * TX + tx] > 0 && t0 - roughAt[ty * TX + tx] > 0.3 { state[ty * TX + tx] = 2 }
        } }
    }
    first = false
    var videoMoved = false
    for ty in 0..<TY { for tx in 0..<TX { busy[ty * TX + tx] = busy[ty * TX + tx] * 0.9 + (state[ty * TX + tx] == 1 ? 0.1 : 0) } }
    if let v = video {
        for ty in v.y0..<v.y1 { for tx in v.x0..<v.x1 {
            if state[ty * TX + tx] == 1 { videoMoved = true; if !starting { changedPx -= min(T, w - tx * T) * min(T, h - ty * T) } }
            if !starting { state[ty * TX + tx] = 0 }
            roughAt[ty * TX + tx] = 0
        } }
        still = videoMoved ? 0 : still + 1
        if starting { videoMoved = true; starting = false }   // the first unit goes even if nothing moved in this picture
    }
    // rough: a sixth of the screen or more moved, or the last picture is not in yet
    let rough = !exact && changedPx > 0 && (changedPx * 6 >= W * H || !frameEnds.isEmpty)
    var runs = [Run]()
    for ty in 0..<TY {
        var start = -1, kind: UInt8 = 0
        for tx in 0...TX {
            let k = tx < TX ? state[ty * TX + tx] : 0
            if k != kind && start >= 0 {
                let x0 = start * T, y0 = ty * T
                runs.append(Run(x: x0, y: y0, w: min(tx * T, w) - x0, h: min(T, h - y0), rough: kind == 1 && rough)); start = -1
            }
            if k != 0 && start < 0 { start = tx }
            kind = k
            if tx < TX && k != 0 { roughAt[ty * TX + tx] = k == 1 && rough ? t0 : 0 }
        }
    }
    if videoMoved, let v = video, let e = encoder {   // the film's picture first: its decoder starts while the RECTs come
        // VideoToolbox's ~7 ms run beside the tiles' encode; the unit goes on the wire from its thread as soon as it is out, between two
        // pictures' RECTs. Counted now: its ACK closes this picture (a unit that failed is ACKed here)
        let r = pixels(v, w, h), te = now()
        rectsSent += 1
        e.encode(pb, x: r.x, y: r.y) { out in
            guard let (au, _) = out else { q.async { rectsAcked += 1; while let f = frameEnds.first, f.0 <= rectsAcked { frameEnds.removeFirst() }; pump() }; return }
            let ms = (now() - te) * 1000
            if trace && videoStats.frames < 3 { print(String(format: "trace: unit out after %.1f ms, %d bytes", ms, au.count)) }
            wire.lock(); writeFull(header(10, 0, r.x, r.y, r.w, r.h, 0, false, au.count), 16); writeFull(au, au.count); wire.unlock()
            q.async { videoStats.frames += 1; videoStats.bytes += 16 + au.count; videoStats.encode += ms; stats.bytes += 16 + au.count; total.bytes += 16 + au.count }
        }
    }
    if runs.isEmpty {
        if videoMoved { frameEnds.append((rectsSent, t0)); stats.frames += 1; total.frames += 1 }
        return
    }
    if rough { stats.rough += 1 }
    // a long run is cut so every core gets work (a whole changed screen is TY runs)
    var cut = [Run]()
    let piece = max(T, (runs.reduce(0) { $0 + $1.w * $1.h } / max(workers * 2, 1) / T + T - 1) / T * T)
    for r in runs { var x = r.x; while x < r.x + r.w { let pw = min(piece, r.x + r.w - x); cut.append(Run(x: x, y: r.y, w: pw, h: r.h, rough: r.rough)); x += pw } }
    let lockedBase = base
    cut.withUnsafeMutableBufferPointer { b in
        let n = b.count, k = min(n, zctx.count)   // worker j encodes runs j, j + k, j + 2k... with its own context
        DispatchQueue.concurrentPerform(iterations: k) { j in for i in stride(from: j, to: n, by: k) { encode(&b[i], lockedBase, bpr, zctx[j]) } }
    }
    stats.encode += (now() - t0) * 1000; more.encodeMax = max(more.encodeMax, (now() - t0) * 1000)
    wire.lock(); defer { wire.unlock() }
    for (i, r) in cut.enumerated() {
        writeFull(header(1, 24, r.x, r.y, r.w, r.h, r.codec, i < cut.count - 1, r.payload.count), 16)
        writeFull(r.payload, r.payload.count)
        stats.bytes += 16 + r.payload.count; stats.raw += r.w * r.h * 3; total.bytes += 16 + r.payload.count
    }
    stats.tiles += cut.count
    rectsSent += cut.count; frameEnds.append((rectsSent, t0)); stats.frames += 1; total.frames += 1
}

final class Out: NSObject, SCStreamOutput, SCStreamDelegate {
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let info = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int else { return }
        if SCFrameStatus(rawValue: raw) == .idle { q.async { more.idle += 1 } }   // macOS composed nothing new on the display
        guard SCFrameStatus(rawValue: raw) == .complete, let pb = sb.imageBuffer else { return }
        q.async { more.captured += 1; if waiting != nil { more.dropped += 1 }; waiting = pb; last = pb; pump() }
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
        c.width = W; c.height = H
        c.pixelFormat = kCVPixelFormatType_32BGRA
        c.minimumFrameInterval = CMTime(value: 1, timescale: 60)
        // the surfaces macOS lends: the newest capture, the one waiting, up to three in the video encoder (it reads them without a copy).
        // With fewer, a film at 30 came at 25 (macOS drops a frame when none is free)
        c.queueDepth = 8
        c.showsCursor = true
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: c, delegate: out)
        do { try s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture")) } catch { die("\(error)") }
        s.startCapture { e in if let e { die("capture: \(e.localizedDescription)") }; print("capturing \(W)x\(H)") }
        stream = s
    }
}
/** The synthetic load (drawSynthetic), 60 pictures a second. */
func startSynthetic() {
    var pool: CVPixelBufferPool?
    CVPixelBufferPoolCreate(nil, nil, [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey: W, kCVPixelBufferHeightKey: H] as CFDictionary, &pool)
    var n = 0
    print("capturing \(W)x\(H) (synthetic, \(synthetic)% moving)")
    Timer.scheduledTimer(withTimeInterval: 1.0 / 60, repeats: true) { _ in
        var pb: CVPixelBuffer?
        guard let pool, CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) == kCVReturnSuccess, let pb else { return }
        drawSynthetic(pb, n, W, H, synthetic)
        n += 1
        q.async { more.captured += 1; if waiting != nil { more.dropped += 1 }; waiting = pb; last = pb; pump() }
    }
}
if synthetic > 0 { startSynthetic() } else { startCapture(0) }

// --- the speed test ("speedtest" on stdin, the Details window's button): on the stream's own connection, while no picture goes. Twenty
// pings (an empty SINK each, answered by ECHO), then SINKs of 256 KB for 3 s; the rate counts until the screen has the last byte
let echoes = DispatchSemaphore(value: 0)
var diag: [[String]] = []
func speedTest() {
    guard caps.contains("sink") else { diag = [["Diagnostics", "Speed test", "this screen's app is too old: update it"]]; return }
    print("speedtest: running")
    var pings = [Double]()
    for i in 0..<20 {
        let t = now(); wire.lock(); writeFull(header(9, 0, i, 0, 0, 0, 0, false, 0), 16); wire.unlock()
        if echoes.wait(timeout: .now() + 2) == .timedOut { break }
        pings.append((now() - t) * 1000)
    }
    let chunk = [UInt8](repeating: 0x5A, count: 256 * 1024)
    var sent = 0, n = 0
    let t0 = now()
    while now() - t0 < 3 { wire.lock(); writeFull(header(9, 0, n, 0, 0, 0, 0, false, chunk.count), 16); writeFull(chunk, chunk.count); wire.unlock(); sent += chunk.count + 16; n += 1 }
    var got = 0
    while got < n && echoes.wait(timeout: .now() + 10) == .success { got += 1 }
    let secs = now() - t0
    pings.sort()
    func ms(_ v: Double) -> String { String(format: "%.1f ms", v) }
    diag = [
        ["Diagnostics", "Measured throughput", got == n ? String(format: "%.0f Mbit/s (%.1f MB in %.1f s, to the screen's app)", Double(sent) * 8 / secs / 1e6, Double(sent) / 1e6, secs) : "lost: \(got) of \(n) answers"],
        ["Diagnostics", "Ping (app to app)", pings.isEmpty ? "no answer" : "\(ms(pings[pings.count / 2])) median, \(ms(pings.first!)) best, \(ms(pings.last!)) worst, \(pings.count) of 20"],
        ["Diagnostics", "Addresses tried", tried.joined(separator: ", ")],
        ["Diagnostics", "Tested at", DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)],
    ]
    print("speedtest: " + diag.map { $0[2] }.prefix(2).joined(separator: "; "))
}
Thread {
    while let l = readLine() { if l == "speedtest" { q.async { speedTest(); info(2) } } }
}.start()

// --- the details panel (the tray's "Details"): one line "info" of [section, name, value] every 2 s
/** The Mac's interface the connection leaves by: its BSD name, what it is (Wi-Fi, Ethernet, USB...) and its rate in bit/s. */
func link() -> (name: String, kind: String, local: String, bps: Int) {
    var sa = sockaddr_in(), n = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &sa) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(sock, $0, &n) } }
    var ip = [CChar](repeating: 0, count: 64); inet_ntop(AF_INET, &sa.sin_addr, &ip, 64)
    let local = String(cString: ip)
    var name = "", bps = 0
    var list: UnsafeMutablePointer<ifaddrs>?
    if getifaddrs(&list) == 0 {
        var p = list
        while let i = p?.pointee {
            if let a = i.ifa_addr, a.pointee.sa_family == sa_family_t(AF_INET),
               a.withMemoryRebound(to: sockaddr_in.self, capacity: 1, { $0.pointee.sin_addr.s_addr }) == sa.sin_addr.s_addr { name = String(cString: i.ifa_name) }
            p = i.ifa_next
        }
        p = list
        while let i = p?.pointee {
            if String(cString: i.ifa_name) == name, let a = i.ifa_addr, a.pointee.sa_family == sa_family_t(AF_LINK), let d = i.ifa_data {
                bps = Int(d.assumingMemoryBound(to: if_data.self).pointee.ifi_baudrate)
            }
            p = i.ifa_next
        }
        freeifaddrs(list)
    }
    var kind = name
    for i in (SCNetworkInterfaceCopyAll() as? [SCNetworkInterface]) ?? [] where SCNetworkInterfaceGetBSDName(i) as String? == name {
        let shown = SCNetworkInterfaceGetLocalizedDisplayName(i) as String? ?? name
        let type = SCNetworkInterfaceGetInterfaceType(i) as String? ?? ""
        kind = type == (kSCNetworkInterfaceTypeIEEE80211 as String) ? "Wi-Fi" : name.hasPrefix("bridge") ? "Thunderbolt bridge" : shown
    }
    if name.hasPrefix("en"), kind == name || kind.contains("Ethernet Adapter") { kind = "USB cable (the Mac as a USB device)" }
    return (name, kind, local, bps)
}
let peer: String = {
    var sa = sockaddr_in(), n = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &sa) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getpeername(sock, $0, &n) } }
    var ip = [CChar](repeating: 0, count: 64); inet_ntop(AF_INET, &sa.sin_addr, &ip, 64)
    return "\(String(cString: ip)):\(port)"
}()
let linkNow = link()
/** The Pi firmware's get_throttled bits, in words: now, then since boot. */
func throttling(_ v: Int) -> String {
    if v < 0 { return "–" }
    let names = [(1, "under-voltage"), (2, "clock capped"), (4, "throttled"), (8, "too hot")]
    let now = names.filter { v & $0.0 != 0 }.map(\.1), past = names.filter { v >> 16 & $0.0 != 0 }.map(\.1)
    if now.isEmpty && past.isEmpty { return "none" }
    return (now.isEmpty ? "none now" : "NOW: " + now.joined(separator: ", ")) + (past.isEmpty ? "" : "; since boot: " + past.joined(separator: ", "))
}
func info(_ seconds: Double) {
    let f = max(stats.frames, 1), r = stats.rtt.sorted()
    var t = tcp_connection_info(), n = socklen_t(MemoryLayout<tcp_connection_info>.size)
    let tcp = getsockopt(sock, IPPROTO_TCP, TCP_CONNECTION_INFO, &t, &n) == 0
    func rate(_ b: Int) -> String { b >= 1_000_000_000 ? String(format: "%.1f Gbit/s", Double(b) / 1e9) : b > 0 ? "\(b / 1_000_000) Mbit/s" : "unknown" }
    func ms(_ v: Double) -> String { String(format: "%.1f ms", v) }
    let up = Int(now() - began)
    var rows: [[String]] = [
        ["Link", "Transport", linkNow.kind],
        ["Link", "Interface", "\(linkNow.name), \(rate(linkNow.bps)) as macOS reports it"],
        ["Link", "Mac", linkNow.local],
        ["Link", "Screen", "\(host) (\(peer))"],
        ["Picture", "Receiver", "\(words[3...].filter { !$0.hasPrefix("+") }.joined(separator: " ")), \(W) × \(H)"],
        ["Picture", "Mac display", mirror >= 0 ? "mirror of display \(mirror)" : hidpi ? "virtual, \(W / 2) × \(H / 2) points at 2x (Retina)" : "virtual, \(W) × \(H) at 1x"],
        ["Picture", "Codec", "\(zstd ? "zstd 1" : "lz4")\(sub ? " + Sub filter" : ""), 64 px tiles\(exact ? ", always exact" : ", 5-6-5 colour while much moves")"],
        ["Picture", "Receiver reads", caps.sorted().joined(separator: " ")],
        ["Rate", "Captured", String(format: "%.0f frames/s, %.0f unchanged (macOS, at most 60 in all: a film at 25 shows here as 25 and 35)", Double(more.captured) / seconds, Double(more.idle) / seconds)],
        ["Rate", "Sent", String(format: "%.0f frames/s, %d skipped (a newer one replaced them)", Double(stats.frames) / seconds, more.dropped)],
        ["Rate", "Throughput", String(format: "%.1f Mbit/s, %.0f KB a frame", Double(stats.bytes) * 8 / seconds / 1e6, Double(stats.bytes) / Double(f) / 1024)],
        ["Rate", "Compression", stats.raw == 0 ? "– (no tile sent)" : String(format: "%.0fx against raw colour, %.1f rectangles a frame", Double(stats.raw) / Double(max(stats.bytes, 1)), Double(stats.tiles) / Double(f))],
        ["Rate", "Rough frames", "\(stats.rough * 100 / f)%"],
        ["Picture", "Video", !h264 ? (caps.contains("h264") ? "off (--no-video)" : "tiles only: the screen has no H.264 decoder") : video.map { v in
            let r = pixels(v, W, H), n = max(videoStats.frames, 1)
            let d = videoDecodeUs.sorted()
            return String(format: "H.264 %d × %d at %d, %d: %.0f pictures/s, %.1f Mbit/s, encode %.1f ms, the screen's hardware decoder %.1f ms (median)",
                          r.w, r.h, r.x, r.y, Double(videoStats.frames) / seconds, Double(videoStats.bytes) * 8 / seconds / 1e6, videoStats.encode / Double(n),
                          d.isEmpty ? 0 : Double(d[d.count / 2]) / 1000) } ?? "none now (H.264 when a part of the screen moves like a film)"],
        ["Picture", "Sound", soundState],
        ["Latency", "Encode (Mac)", stats.raw == 0 ? "– (no tile sent)" : "\(ms(stats.encode / Double(f))) average, \(ms(more.encodeMax)) slowest, \(workers) cores"],
        ["Latency", "Shown (screen)", shownUs.isEmpty ? "–" : { let v = shownUs.sorted(); return String(format: "commit %.1f ms after the last byte (median, %.1f p95), on screen at the next refresh (≤ 16.7 ms)", Double(v[v.count / 2]) / 1000, Double(v[min(v.count - 1, v.count * 95 / 100)]) / 1000) }()],
        ["Latency", "Decode (screen)", more.decodeUs == 0 && pictureUs.isEmpty ? "– (no tile sent)" : (pictureUs.isEmpty ? "" : { let v = pictureUs.sorted(); return String(format: "%.1f ms a picture (median, %.1f p95), ", Double(v[v.count / 2]) / 1000, Double(v[min(v.count - 1, v.count * 95 / 100)]) / 1000) }())
            + ms(Double(more.decodeUs) / Double(f) / 1000) + " of CPU a frame"],
        ["Latency", "Frame round trip", r.isEmpty ? "–" : "\(ms(r[r.count / 2])) median, \(ms(r[min(r.count - 1, r.count * 95 / 100)])) p95, \(ms(r.last!)) max"],
        ["Latency", "Network (TCP)", tcp ? String(format: "%.1f ms, ± %.1f, %d KB queued, %d resent", Double(t.tcpi_srtt), Double(t.tcpi_rttvar), Int(t.tcpi_snd_sbbytes) / 1024, Int(t.tcpi_txretransmitpackets)) : "–"],
        ["Latency", "In flight", "\(frameEnds.count) of \(inFlight) frames (1 when the round trip passes a refresh)"],
        ["Screen", "CPU", rx[0][1] < 0 ? "–" : "\(rx[0][1] / 10)% of all cores" + (rx[1][0] < 0 ? "" : ", \(rx[1][0]) of \(rx[1][1]) MHz")],
        ["Screen", "Temperature", rx[0][0] < 0 ? "–" : String(format: "%.1f °C", Double(rx[0][0]) / 1000)],
        ["Screen", "Throttling", throttling(rx[1][2])],
        ["Screen", "Memory", rx[0][2] < 0 ? "–" : "\(rx[0][2]) MB free" + (rx[2][0] < 0 ? "" : " of \(rx[2][0]) MB")],
        ["Screen", "Up for", rx[2][1] < 0 ? "–" : String(format: "%d h %02d min", rx[2][1] / 3600, rx[2][1] / 60 % 60)],
        ["Session", "Running", String(format: "%d:%02d:%02d", up / 3600, up / 60 % 60, up % 60)],
        ["Session", "Sent", String(format: "%.1f MB in %d frames", Double(total.bytes) / 1e6, total.frames)],
    ]
    if stats.frames == 0 { rows[9][2] = "0 frames/s: nothing moved" }
    rows += diag.isEmpty ? [["Diagnostics", "Addresses tried", tried.joined(separator: ", ")], ["Diagnostics", "Speed test", "not run yet"]] : diag
    if let d = try? JSONSerialization.data(withJSONObject: rows), let j = String(data: d, encoding: .utf8) { print("info " + j) }
    more = (0, 0, 0, 0, 0); shownUs = []; pictureUs = []; videoStats = (0, 0, 0); videoDecodeUs = []
}

// every 2 s: pictures, wire rate, the ratio against raw BGR, the encoder's time, the round trip of a picture
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    q.async {
        let f = stats.frames, r = stats.rtt.sorted()
        // a film: the encoder and the screen's decoder each work on the next ones while one waits for the refresh. Four for one that fills
        // half the screen or more (1080p at 60: 18 ms to encode, 30 to decode; three gave 50 a second), three for a smaller one (four
        // only queued its pictures at the decoder: 36 ms of round trip instead of 20)
        if !r.isEmpty { lastRtt = r[r.count / 2] }
        pace()
        if f > 0 {
            print(String(format: "%.0f frames/s  %.1f Mbit/s  %.0fx  %.1f runs  rough %d%%  encode %.1f ms  round trip %.0f ms median, %.0f max", Double(f) / 2,
                         Double(stats.bytes) * 8 / 2e6, Double(stats.raw) / Double(max(stats.bytes, 1)), Double(stats.tiles) / Double(f),
                         stats.rough * 100 / f, stats.encode / Double(f), r.isEmpty ? 0 : r[r.count / 2], r.last ?? 0))
        }
        info(2)
        stats = (0, 0, 0, 0, [], 0, 0)
    }
}
// rough tiles that rested go again exact, even when nothing new comes from the capture
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
    q.async { if waiting == nil, let pb = last, frameEnds.isEmpty, roughAt.contains(where: { $0 > 0 && now() - $0 > 0.3 }) { send(pb) } }
}
if seconds > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { exit(0) } }
signal(SIGINT) { _ in exit(0) }
RunLoop.main.run()
