// sidecar-screen: the Mac half of Sidecar for a colour screen with a network (a Raspberry Pi on HDMI running app/sidecar-screen, the
// receiver of display-fbdev, plugins/display-rmpp/stream.h). A virtual display the receiver's size (or a mirrored one) captured in BGRA;
// the 64-pixel tiles that changed since what the receiver shows, joined in runs along a row, each run filtered (PNG's Sub) and compressed
// (zstd 1, else lz4) on every core at once, sent as RECTs of one picture. At most two pictures wait for the receiver's ACKs: a newer
// capture replaces the one waiting, so the screen never lags behind the network.
// A picture where much of the screen changes (a video, a page switch), or that comes while the link is still busy, goes rough: its colours
// cut to 5-6-5 bits (half the bytes after zstd on a desktop, codecbench), nothing new for the receiver to decode; each rough tile is sent
// again exact once it has rested 300 ms.
//   sidecar-screen --host <address> [--port 7710] [--mirror <display>] [--hidpi] [--lz4] [--exact] [--seconds n]
import Foundation
import ScreenCaptureKit
import CoreMedia
import SystemConfiguration

setvbuf(stdout, nil, _IOLBF, 0)
func die(_ s: String) -> Never { print("sidecar-screen: \(s)"); exit(1) }
var host = "", port: UInt16 = 7710, mirror = -1, hidpi = false, forceLz4 = false, seconds = 0.0, exact = false
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
    default: die("unknown option \(a)")
    }
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

// --- pacing: the ACKs of each picture's last RECT; at most two pictures out, the newest capture waits for a free place
let q = DispatchQueue(label: "send")
var rectsSent = 0, rectsAcked = 0, frameEnds = [(Int, Double)]()   // the rect count at each picture's end, and when it went
var waiting: CVPixelBuffer?
var stats = (frames: 0, bytes: 0, raw: 0, encode: 0.0, rtt: [Double](), tiles: 0, rough: 0)
// the details panel's counters: captures that came and were replaced before going, the receiver's decode time, the slowest encode
var more = (captured: 0, dropped: 0, decodeUs: 0, encodeMax: 0.0)
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
        if m[0] == 1 { q.async { rectsAcked += 1; more.decodeUs += b
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
    if runs.isEmpty { return }
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
        guard type == .screen, let pb = sb.imageBuffer,
              let info = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = info.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
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
        c.queueDepth = 4
        c.showsCursor = true
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: c, delegate: out)
        do { try s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture")) } catch { die("\(error)") }
        s.startCapture { e in if let e { die("capture: \(e.localizedDescription)") }; print("capturing \(W)x\(H)") }
        stream = s
    }
}
startCapture(0)

// --- the speed test ("speedtest" on stdin, the Details window's button): on the stream's own connection, while no picture goes. Twenty
// pings (an empty SINK each, answered by ECHO), then SINKs of 256 KB for 3 s; the rate counts until the screen has the last byte
let echoes = DispatchSemaphore(value: 0)
var diag: [[String]] = []
func speedTest() {
    guard caps.contains("sink") else { diag = [["Diagnostics", "Speed test", "this screen's app is too old: update it"]]; return }
    print("speedtest: running")
    var pings = [Double]()
    for i in 0..<20 {
        let t = now(); writeFull(header(9, 0, i, 0, 0, 0, 0, false, 0), 16)
        if echoes.wait(timeout: .now() + 2) == .timedOut { break }
        pings.append((now() - t) * 1000)
    }
    let chunk = [UInt8](repeating: 0x5A, count: 256 * 1024)
    var sent = 0, n = 0
    let t0 = now()
    while now() - t0 < 3 { writeFull(header(9, 0, n, 0, 0, 0, 0, false, chunk.count), 16); writeFull(chunk, chunk.count); sent += chunk.count + 16; n += 1 }
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
        ["Rate", "Captured", String(format: "%.0f frames/s (macOS, at most 60)", Double(more.captured) / seconds)],
        ["Rate", "Sent", String(format: "%.0f frames/s, %d skipped (a newer one replaced them)", Double(stats.frames) / seconds, more.dropped)],
        ["Rate", "Throughput", String(format: "%.1f Mbit/s, %.0f KB a frame", Double(stats.bytes) * 8 / seconds / 1e6, Double(stats.bytes) / Double(f) / 1024)],
        ["Rate", "Compression", String(format: "%.0fx against raw colour, %.1f rectangles a frame", Double(stats.raw) / Double(max(stats.bytes, 1)), Double(stats.tiles) / Double(f))],
        ["Rate", "Rough frames", "\(stats.rough * 100 / f)%"],
        ["Latency", "Encode (Mac)", "\(ms(stats.encode / Double(f))) average, \(ms(more.encodeMax)) slowest, \(workers) cores"],
        ["Latency", "Decode (screen)", ms(Double(more.decodeUs) / Double(f) / 1000) + " a frame"],
        ["Latency", "Frame round trip", r.isEmpty ? "–" : "\(ms(r[r.count / 2])) median, \(ms(r[min(r.count - 1, r.count * 95 / 100)])) p95, \(ms(r.last!)) max"],
        ["Latency", "Network (TCP)", tcp ? String(format: "%.1f ms, ± %.1f, %d KB queued, %d resent", Double(t.tcpi_srtt), Double(t.tcpi_rttvar), Int(t.tcpi_snd_sbbytes) / 1024, Int(t.tcpi_txretransmitpackets)) : "–"],
        ["Latency", "In flight", "\(frameEnds.count) of 2 frames"],
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
    more = (0, 0, 0, 0)
}

// every 2 s: pictures, wire rate, the ratio against raw BGR, the encoder's time, the round trip of a picture
Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
    q.async {
        let f = stats.frames, r = stats.rtt.sorted()
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
