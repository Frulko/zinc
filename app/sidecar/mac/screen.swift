// sidecar-screen: the Mac half of Sidecar for a colour screen with a network (a Raspberry Pi on HDMI running app/sidecar-screen, the
// receiver of display-fbdev, plugins/display-rmpp/stream.h). A virtual display the receiver's size (or a mirrored one) captured in BGRA;
// the 64-pixel tiles that changed since what the receiver shows, joined in runs along a row, each run filtered (PNG's Sub) and compressed
// (zstd 1, else lz4) on every core at once, sent as RECTs of one picture. At most two pictures wait for the receiver's ACKs: a newer
// capture replaces the one waiting, so the screen never lags behind the network.
//   sidecar-screen --host <address> [--port 7710] [--mirror <display>] [--hidpi] [--lz4] [--seconds n]
import Foundation
import ScreenCaptureKit
import CoreMedia

setvbuf(stdout, nil, _IOLBF, 0)
func die(_ s: String) -> Never { print("sidecar-screen: \(s)"); exit(1) }
var host = "", port: UInt16 = 7710, mirror = -1, hidpi = false, forceLz4 = false, seconds = 0.0
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
    default: die("unknown option \(a)")
    }
}
if host.isEmpty { die("--host <the screen's address> is needed (app/sidecar-screen shows it)") }

// --- the connection: the receiver says "RMPP <w> <h> <model> +caps..."
var sock: Int32 = -1
for tries in 0... {
    sock = socket(AF_INET, SOCK_STREAM, 0)
    var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = port.bigEndian
    if inet_pton(AF_INET, host, &a.sin_addr) != 1 {   // a name (pi.local): its first IPv4 address
        var res: UnsafeMutablePointer<addrinfo>?; var hints = addrinfo(); hints.ai_family = AF_INET
        guard getaddrinfo(host, nil, &hints, &res) == 0, let r = res else { die("cannot resolve \(host)") }
        a.sin_addr = r.pointee.ai_addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr }; freeaddrinfo(res)
    }
    if withUnsafePointer(to: &a, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) == 0 { break }
    close(sock)
    if tries == 0 { print("waiting for the screen at \(host):\(port) (open Sidecar Screen on it)") }
    usleep(500_000)
}
var one: Int32 = 1
setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
func readFull(_ p: UnsafeMutableRawPointer, _ n: Int) { var got = 0; while got < n { let r = read(sock, p + got, n - got); if r < 0 && errno == EINTR { continue }; if r <= 0 { die("the screen went away") }; got += r } }
func writeFull(_ p: UnsafeRawPointer, _ n: Int) { var put = 0; while put < n { let r = write(sock, p + put, n - put); if r < 0 && errno == EINTR { continue }; if r <= 0 { die("the screen went away") }; put += r } }
var line = [UInt8]()
while true { var c: UInt8 = 0; readFull(&c, 1); if c == 10 { break }; line.append(c) }
let words = String(decoding: line, as: UTF8.self).split(separator: " ").map(String.init)
let caps = Set(words.filter { $0.hasPrefix("+") }.map { String($0.dropFirst()) })
let W = words.count >= 4 ? Int(words[1]) ?? 0 : 0, H = words.count >= 4 ? Int(words[2]) ?? 0 : 0
if W <= 0 || H <= 0 || !caps.contains("rgb") { die("not a colour screen: \(words.joined(separator: " "))") }
let zstd = caps.contains("zstd") && !forceLz4, sub = caps.contains("sub")
print("screen: \(words[3...].filter { !$0.hasPrefix("+") }.joined(separator: " ")) \(W)x\(H), \(zstd ? "zstd" : "lz4")\(sub ? " + Sub" : "")")

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
var target: CGDirectDisplayID
if mirror >= 0 {
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
struct Run { let x: Int, y: Int, w: Int, h: Int; var payload = [UInt8](); var codec: UInt8 = 0 }
let workers = ProcessInfo.processInfo.activeProcessorCount
let zctx = (0..<max(workers, 1)).map { _ in ZSTD_createCCtx() }   // one per worker

/** The run's pixels from the capture, as B, G, R rows, Sub-filtered and compressed. */
func encode(_ r: inout Run, _ base: UnsafePointer<UInt8>, _ bpr: Int, _ ctx: OpaquePointer?) {
    let stride = r.w * 3
    var raw = [UInt8](repeating: 0, count: stride * r.h)
    raw.withUnsafeMutableBufferPointer { o in
        for j in 0..<r.h {
            let p = base + (r.y + j) * bpr + r.x * 4, q = o.baseAddress! + j * stride
            for i in 0..<r.w { q[i * 3] = p[i * 4]; q[i * 3 + 1] = p[i * 4 + 1]; q[i * 3 + 2] = p[i * 4 + 2] }
            if sub { var i = stride - 1; while i >= 3 { q[i] = q[i] &- q[i - 3]; i -= 1 } }
        }
    }
    var out = [UInt8](repeating: 0, count: zstd ? ZSTD_compressBound(raw.count) : Int(LZ4_compressBound(Int32(raw.count))))
    let n = zstd ? ZSTD_compressCCtx(ctx, &out, out.count, raw, raw.count, 1) : Int(LZ4_compress_default(raw, &out, Int32(raw.count), Int32(out.count)))
    if n > 0 && n < raw.count && ZSTD_isError(n) == 0 { out.removeSubrange(n...); r.payload = out; r.codec = (zstd ? 2 : 1) | (sub ? 0x80 : 0) }
    else { r.payload = raw; r.codec = sub ? 0x80 : 0 }
}

// --- pacing: the ACKs of each picture's last RECT; at most two pictures out, the newest capture waits for a free place
let q = DispatchQueue(label: "send")
var rectsSent = 0, rectsAcked = 0, frameEnds = [(Int, Double)]()   // the rect count at each picture's end, and when it went
var waiting: CVPixelBuffer?
var stats = (frames: 0, bytes: 0, raw: 0, encode: 0.0, rtt: [Double](), tiles: 0)
func now() -> Double { CFAbsoluteTimeGetCurrent() }
Thread {
    var m = [UInt8](repeating: 0, count: 16)
    while true {
        readFull(&m, 16)
        if m[0] == 1 { q.async { rectsAcked += 1
            while let f = frameEnds.first, f.0 <= rectsAcked { stats.rtt.append((now() - f.1) * 1000); frameEnds.removeFirst() }
            pump() } }
    }
}.start()

func pump() {
    guard frameEnds.count < 2, let pb = waiting else { return }
    waiting = nil
    send(pb)
}

func send(_ pb: CVPixelBuffer) {
    CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = min(W, CVPixelBufferGetWidth(pb)), h = min(H, CVPixelBufferGetHeight(pb)), bpr = CVPixelBufferGetBytesPerRow(pb)
    let base = UnsafePointer(CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self))
    let t0 = now()
    // the changed tiles, joined along each row of tiles
    var runs = [Run]()
    shown.withUnsafeMutableBufferPointer { s in
        for ty in 0..<TY {
            var start = -1
            for tx in 0...TX {
                var changed = false
                if tx < TX {
                    let x0 = tx * T, y0 = ty * T, tw = min(T, w - x0), th = min(T, h - y0)
                    if tw > 0 && th > 0 {
                        changed = first
                        for y in y0..<(y0 + th) where !changed { changed = memcmp(base + y * bpr + x0 * 4, s.baseAddress! + (y * W + x0) * 4, tw * 4) != 0 }
                        if changed { for y in y0..<(y0 + th) { memcpy(s.baseAddress! + (y * W + x0) * 4, base + y * bpr + x0 * 4, tw * 4) } }
                    }
                }
                if changed && start < 0 { start = tx }
                if !changed && start >= 0 {
                    let x0 = start * T, y0 = ty * T
                    runs.append(Run(x: x0, y: y0, w: min(tx * T, w) - x0, h: min(T, h - y0))); start = -1
                }
            }
        }
    }
    first = false
    if runs.isEmpty { return }
    // a long run is cut so every core gets work (a whole changed screen is TY runs)
    var cut = [Run]()
    let piece = max(T, (runs.reduce(0) { $0 + $1.w * $1.h } / max(workers * 2, 1) / T + T - 1) / T * T)
    for r in runs { var x = r.x; while x < r.x + r.w { let pw = min(piece, r.x + r.w - x); cut.append(Run(x: x, y: r.y, w: pw, h: r.h)); x += pw } }
    let lockedBase = base
    cut.withUnsafeMutableBufferPointer { b in
        let n = b.count, k = min(n, zctx.count)   // worker j encodes runs j, j + k, j + 2k... with its own context
        DispatchQueue.concurrentPerform(iterations: k) { j in for i in stride(from: j, to: n, by: k) { encode(&b[i], lockedBase, bpr, zctx[j]) } }
    }
    stats.encode += (now() - t0) * 1000
    for (i, r) in cut.enumerated() {
        writeFull(header(1, 24, r.x, r.y, r.w, r.h, r.codec, i < cut.count - 1, r.payload.count), 16)
        writeFull(r.payload, r.payload.count)
        stats.bytes += 16 + r.payload.count; stats.raw += r.w * r.h * 3
    }
    stats.tiles += cut.count
    rectsSent += cut.count; frameEnds.append((rectsSent, t0)); stats.frames += 1
}

final class Out: NSObject, SCStreamOutput, SCStreamDelegate {
    func stream(_ s: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let pb = sb.imageBuffer,
              let info = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
        q.async { waiting = pb; pump() }
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
        c.queueDepth = 4
        c.showsCursor = true
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: c, delegate: out)
        do { try s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture")) } catch { die("\(error)") }
        s.startCapture { e in if let e { die("capture: \(e.localizedDescription)") }; print("capturing \(W)x\(H)") }
        stream = s
    }
}
startCapture(0)

// every 2 s: pictures, wire rate, the ratio against raw BGR, the encoder's time, the round trip of a picture
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    q.async {
        let f = stats.frames, r = stats.rtt.sorted()
        if f > 0 {
            print(String(format: "%.0f frames/s  %.1f Mbit/s  %.0fx  %.1f runs  encode %.1f ms  round trip %.0f ms median, %.0f max", Double(f) / 2,
                         Double(stats.bytes) * 8 / 2e6, Double(stats.raw) / Double(max(stats.bytes, 1)), Double(stats.tiles) / Double(f),
                         stats.encode / Double(f), r.isEmpty ? 0 : r[r.count / 2], r.last ?? 0))
        }
        stats = (0, 0, 0, 0, [], 0)
    }
}
if seconds > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { exit(0) } }
signal(SIGINT) { _ in exit(0) }
RunLoop.main.run()
