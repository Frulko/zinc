// sidecar: the Mac half of Sidecar (app/sidecar is the tablet's). A virtual display at the tablet's ratio (or a mirrored display) captured by
// ScreenCaptureKit, its luma dithered to 1 bit, and only the 32x16 tiles that changed sent to the tablet's driver (display-rmpp stream.h, TCP 7710),
// one frame in flight: a frame that comes while the tablet works is replaced by the next, never queued.
//   sidecar [--host 10.11.99.1] [--native | --points WxH (Retina; default half the tablet's pixels) | --mirror <display index>] [--threshold] [--idle ms] [--levels black,white] [--gamma g] [--edges gain] [--cursor px] [--clean-mode 3|4] [--seconds N]
import Foundation
import Accelerate
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import ApplicationServices

var host = "10.11.99.1", points = (0, 0), native = false, mirror = -1, threshold = false, seconds = 0.0, idleMs = 1000, cursorPx = 0, cleanMode = 3, levels = (90, 185), gamma = 1.6, edges = 10
var argv = CommandLine.arguments.dropFirst()
while let a = argv.popFirst() {
    switch a {
    case "--host": host = argv.popFirst()!
    case "--points": let p = argv.popFirst()!.split(separator: "x").map { Int($0)! }; points = (p[0], p[1])
    case "--native": native = true   // 1:1, not Retina: twice the room, everything half as big
    case "--mirror": mirror = Int(argv.popFirst()!)!
    case "--threshold": threshold = true
    case "--cursor": cursorPx = max(19, Int(argv.popFirst()!)!)   // draw the pointer here, this many tablet pixels tall (default: macOS draws it in the capture)
    case "--edges": edges = Int(argv.popFirst()!)!   // how hard a pixel darker than its neighbours is pushed to black (0: off)
    case "--clean-mode": cleanMode = Int(argv.popFirst()!)!   // the clean pass's waveform: 3 xochitl's page one, 4 UI
    case "--levels": let l = argv.popFirst()!.split(separator: ",").map { Int($0)! }; levels = (l[0], l[1])   // the tone curve's black and white points
    case "--gamma": gamma = Double(argv.popFirst()!)!
    case "--idle": idleMs = Int(argv.popFirst()!)!   // ms without change before the clean pass; 0: never
    case "--seconds": seconds = Double(argv.popFirst()!)!
    default: fputs("sidecar [--host h] [--native | --points WxH | --mirror n] [--threshold] [--idle ms] [--levels black,white] [--gamma g] [--edges gain] [--cursor px] [--clean-mode 3|4] [--seconds N]\n", stderr); exit(2)
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

// --- the e-ink tone curve: the panel shows two levels while things move, so what is nearly white (a window's background, a light grey bar)
// goes to white and what is nearly black (text) to black, before the dither; only true middle tones (pictures) keep a pattern.
// --levels black,white (default 90,185): the luma at and under black is black, at and over white is white; --gamma (1.6) bends the line between.
let tone: [UInt8] = (0..<256).map { v in
    let t = max(0, min(1, (Double(v) - Double(levels.0)) / Double(max(1, levels.1 - levels.0))))
    return UInt8((pow(t, gamma) * 255).rounded())   // gamma over 1 darkens the middle: thin text gets thicker
}
// and the edges: a pixel darker than the lightest of its 5x5 neighbours by more than 4 loses --edges (10) levels per level of difference, so
// a hairline of light grey on white (a window's border, a separator, 220 or 240 on 255) comes out black or dotted instead of white, and
// text gets a little bolder; the light side of an edge, and smooth gradients, keep the curve's value
var maxBuf = [UInt8](repeating: 255, count: 0)
/** The frame's luma over box b (frame pixels) -> grey, at its place on the panel. */
func shade(_ src: UnsafePointer<UInt8>, _ bpr: Int, _ fw: Int, _ fh: Int, _ b: (Int, Int, Int, Int)) {
    let bw = b.2 - b.0, bh = b.3 - b.1
    if maxBuf.count < bw * bh { maxBuf = [UInt8](repeating: 255, count: W * H) }
    grey.withUnsafeMutableBufferPointer { g in maxBuf.withUnsafeMutableBufferPointer { m in tone.withUnsafeBufferPointer { t in
        if edges > 0 {
            var si = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: src), height: vImagePixelCount(fh), width: vImagePixelCount(fw), rowBytes: bpr)
            var mo = vImage_Buffer(data: m.baseAddress!, height: vImagePixelCount(bh), width: vImagePixelCount(bw), rowBytes: bw)
            vImageMax_Planar8(&si, &mo, nil, vImagePixelCount(b.0), vImagePixelCount(b.1), 5, 5, vImage_Flags(kvImageEdgeExtend))
        }
        for y in 0..<bh {
            let s = src + (b.1 + y) * bpr + b.0, d = g.baseAddress! + (b.1 + y + region.oy) * W + region.ox + b.0, mx = m.baseAddress! + y * bw
            if edges == 0 { for x in 0..<bw { d[x] = t[Int(s[x])] }; continue }
            for x in 0..<bw { let v = Int(s[x]); d[x] = UInt8(max(0, Int(t[v]) - max(0, Int(mx[x]) - v - 4) * edges)) }
        }
    } } }
}

// --- the sender: the newest frame only, one frame in flight
let stride = (W + 7) / 8
let TW = 32, TH = 16, tilesX = (W + TW - 1) / TW, tilesY = (H + TH - 1) / TH   // the tiles a change is counted in
var grey = [UInt8](repeating: 255, count: W * H)    // the capture through the tone curve, at its place on the panel
var shown = grey                                     // grey with the pointer: what the tablet should show
var dirty = [UInt8](repeating: 0, count: stride * H) // per pixel, 1 bit: drawn in the fast waveform since it was last cleaned
var prev = [UInt8](repeating: 0, count: stride * H)  // what the tablet shows, 1 bit (unknown before the first frame: the app's page)
var firstFrame = true, firstFull = true
var cur = prev
let lock = NSLock(), ready = DispatchSemaphore(value: 0)
var latest: CVPixelBuffer?, frameDirty = CGRect.null   // the newest frame, and what changed since the last one taken (frame pixels)
let bayer: [UInt8] = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
                      3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
let thr: [UInt8] = threshold ? [UInt8](repeating: 128, count: 64) : bayer.map { UInt8(Int($0) * 4 + 2) }
var stats = (frames: 0, rects: 0, bytes: 0, dither: 0.0, wait: 0.0, t: now())

/** shown -> cur, 1 bit, over rows y0..<y1 and the bytes holding x0..<x1. */
func dither(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int) {
    let b0 = x0 / 8, b1 = (x1 + 7) / 8
    cur.withUnsafeMutableBufferPointer { c in thr.withUnsafeBufferPointer { t in shown.withUnsafeBufferPointer { g in
        for y in y0..<y1 {
            let row = g.baseAddress! + y * W, out = c.baseAddress! + y * stride, tr = t.baseAddress! + (y & 7) * 8
            for bx in b0..<b1 {
                let x = bx * 8
                var b: UInt8 = 0
                for i in 0..<min(8, W - x) where row[x + i] < tr[i] { b |= 0x80 >> UInt8(i) }
                out[bx] = b
            }
        }
    } } }
}

/** The tiles of tiles x tx0..<tx1, ty0..<ty1 marked in `mask` as rectangles: per band of tiles the span of marked columns, bands merged
 *  while that wastes little. */
func rectsOf(_ mask: [Bool], _ tx0: Int = 0, _ ty0: Int = 0, _ tx1: Int = tilesX, _ ty1: Int = tilesY) -> [(Int, Int, Int, Int)] {
    var rects: [(Int, Int, Int, Int)] = []
    for ty in ty0..<ty1 {
        var lo = Int.max, hi = -1
        for tx in tx0..<tx1 where mask[ty * tilesX + tx] { lo = min(lo, tx); hi = tx }
        guard hi >= 0 else { continue }
        let by = ty * TH, bh = min(TH, H - by), x0 = lo * TW, x1 = min((hi + 1) * TW, W)
        if var r = rects.last, r.1 + r.3 == by {
            let ux0 = min(r.0, x0), ux1 = max(r.0 + r.2, x1)
            if (ux1 - ux0) * (r.3 + bh) <= (r.2 * r.3 + (x1 - x0) * bh) * 13 / 10 { r = (ux0, r.1, ux1 - ux0, r.3 + bh); rects[rects.count - 1] = r; continue }
        }
        rects.append((x0, by, x1 - x0, bh))
    }
    return rects
}

/** The tiles where cur differs from prev, within a pixel box. */
func changed(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int) -> [Bool] {
    var m = [Bool](repeating: false, count: tilesX * tilesY)
    for ty in (y0 / TH)..<min(tilesY, (y1 + TH - 1) / TH) {
        for tx in (x0 / TW)..<min(tilesX, (x1 + TW - 1) / TW) {
            let b0 = tx * TW / 8, b1 = min(stride, (tx + 1) * TW / 8)
            var diff = false
            for y in (ty * TH)..<min(H, (ty + 1) * TH) where !diff { let o = y * stride; for i in b0..<b1 where cur[o + i] != prev[o + i] { diff = true; break } }
            m[ty * tilesX + tx] = diff
        }
    }
    return m
}

// --- the clean pass: the fast waveform leaves trails. A tile drawn fast is drawn again in true greys in --clean-mode's waveform once
// nothing has changed for --idle ms (a blinking caret never rests that long, so it is never cleaned), and the pointer's trail 300 ms after
// it stops; a third of the screen or more at once, or four screens of cleaning, is one full refresh instead.
var fastTiles = [Bool](repeating: false, count: tilesX * tilesY), trailTiles = fastTiles
var tileTime = [Double](repeating: 0, count: tilesX * tilesY)   // when each tile last changed: a tile is cleaned once it rests, whatever the others do
var fastMode = true, cleaned = 0, lastMove = 0.0
func clean(_ mask: inout [Bool]) {
    let rects = rectsOf(mask)
    mask = [Bool](repeating: false, count: tilesX * tilesY)
    if rects.isEmpty { return }
    func greys(_ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        var payload = [UInt8](repeating: 0, count: w * h)
        for j in 0..<h { let o = (y + j) * W + x; payload.replaceSubrange(j * w..<(j + 1) * w, with: shown[o..<(o + w)]) }
        var hd = header(1, x, y, w, h, payload.count); hd[1] = 8
        writeFull(hd, 16); writeFull(payload, payload.count)
    }
    if rects.reduce(0, { $0 + $1.2 * $1.3 }) * 3 >= W * H {   // much of the screen: one full refresh is one flash, and cleaner
        for (x, y, w, h) in rects { greys(x, y, w, h) }
        for _ in rects { acks.wait() }
        writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0
        for i in 0..<dirty.count { dirty[i] = 0 }
        return
    }
    // a partial update drives only the pixels whose value changes, and a trail's are white already: the pixels drawn fast go black first,
    // in the fast waveform, so that they move again (the local flash of xochitl's eraser, on the strokes only), then the real content
    if !fastMode { writeFull(header(2, 0, 0, 0, 0, 0), 16); fastMode = true }
    for (x, y, w, h) in rects {
        let rs = (w + 7) / 8
        var black = [UInt8](repeating: 0, count: rs * h)
        for j in 0..<h { let o = (y + j) * stride + x / 8; for i in 0..<rs { black[j * rs + i] = cur[o + i] | dirty[o + i]; dirty[o + i] = 0 } }
        writeFull(header(1, x, y, w, h, black.count), 16); writeFull(black, black.count)
    }
    for _ in rects { acks.wait() }
    writeFull(header(2, cleanMode, 0, 0, 0, 0), 16); fastMode = false
    for (x, y, w, h) in rects { cleaned += w * h; greys(x, y, w, h); acks.wait() }
    if cleaned > W * H * 4 { writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0 }
}

// --- the pointer: drawn here, not captured, black with a white edge; it moves without a new frame of the screen, and only its old and
// new boxes are dithered and compared again
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
let edge = 2
// the arrow's mask at --cursor pixels tall: 2 black, 1 its white edge, 0 outside; drawn with its tip at (edge, edge)
let pointerMask: (w: Int, h: Int, m: [UInt8]) = {
    let k = Double(cursorPx) / 19, e = edge, w = Int(12 * k) + 2 * e, h = cursorPx + 2 * e
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
func pointerBox(_ p: (x: Int, y: Int)) -> (Int, Int, Int, Int) {
    if cursorPx == 0 { return (max(0, p.x - 8), max(0, p.y - 8), min(W, p.x + 56), min(H, p.y + 72)) }   // macOS's arrow and its shadow, Retina
    return (max(0, p.x - edge), max(0, p.y - edge), min(W, p.x - edge + pointerMask.w), min(H, p.y - edge + pointerMask.h))
}
func drawPointer(_ p: (x: Int, y: Int)) {
    let pm = pointerMask
    for y in 0..<pm.h { let yy = p.y - edge + y; if yy < 0 || yy >= H { continue }
        for x in 0..<pm.w where pm.m[y * pm.w + x] != 0 { let xx = p.x - edge + x; if xx >= 0 && xx < W { shown[yy * W + xx] = pm.m[y * pm.w + x] == 2 ? 0 : 255 } } }
}
func pointerNow() -> (x: Int, y: Int)? {
    guard let loc = CGEvent(source: nil)?.location else { return nil }
    let b = CGDisplayBounds(target)
    guard b.contains(loc) else { return nil }
    return (region.ox + Int((loc.x - b.minX) * Double(region.fw) / b.width), region.oy + Int((loc.y - b.minY) * Double(region.fh) / b.height))
}
var pointerMoved = false
let pointerTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
pointerTimer.schedule(deadline: .now(), repeating: .milliseconds(8))
pointerTimer.setEventHandler {
    let p = pointerNow()
    lock.lock()
    if p?.x != pointer?.x || p?.y != pointer?.y { pointer = p; pointerMoved = true; lock.unlock(); ready.signal() } else { lock.unlock() }
}
pointerTimer.resume()

Thread {
    var drawn: (x: Int, y: Int)? = nil   // where the pointer is drawn in shown
    func any(_ m: [Bool]) -> Bool { m.contains(true) }
    while true {
        if (idleMs > 0 && any(fastTiles)) || any(trailTiles) { _ = ready.wait(timeout: .now() + .milliseconds(30)) } else { ready.wait() }
        let tn = now()
        var rested = [Bool](repeating: false, count: fastTiles.count)
        if idleMs > 0 && tn - lastMove >= 300 { for i in 0..<fastTiles.count where fastTiles[i] && tn - tileTime[i] >= Double(idleMs) { rested[i] = true } }
        if any(rested) {
            for i in 0..<rested.count where rested[i] || trailTiles[i] { rested[i] = true; fastTiles[i] = false; trailTiles[i] = false }
            clean(&rested)
        } else if any(trailTiles) && tn - lastMove >= 300 { clean(&trailTiles) }
        lock.lock(); let pb = latest, fd = frameDirty; latest = nil; frameDirty = .null; let moved = pointerMoved; pointerMoved = false; let p = pointer; lock.unlock()
        if pb == nil && !moved { continue }
        let t0 = now()
        var box = (x0: W, y0: H, x1: 0, y1: 0)   // what to dither and compare
        func grow(_ b: (Int, Int, Int, Int)) { box = (min(box.x0, b.0), min(box.y0, b.1), max(box.x1, b.2), max(box.y1, b.3)) }
        if let pb {   // a new frame: what changed in it (all of it when its place moved), through the shader into grey and shown
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            let fw = min(CVPixelBufferGetWidthOfPlane(pb, 0), W), fh = min(CVPixelBufferGetHeightOfPlane(pb, 0), H), bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
            let reg = ((W - fw) / 2 / 8 * 8, (H - fh) / 2, fw, fh)
            var d = (0, 0, fw, fh)
            if !firstFrame && reg == (region.ox, region.oy, region.fw, region.fh) && !fd.isNull && !fd.isInfinite {   // 2 pixels more: the edges reach that far
                d = (max(0, Int(fd.minX) - 2), max(0, Int(fd.minY) - 2), min(fw, Int(fd.maxX.rounded(.up)) + 2), min(fh, Int(fd.maxY.rounded(.up)) + 2))
            }
            region = (reg.0, reg.1, reg.2, reg.3)
            let src = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
            if d.2 > d.0 && d.3 > d.1 {
                shade(src, bpr, fw, fh, d)
                let b = (d.0 + region.ox, d.1 + region.oy, d.2 + region.ox, d.3 + region.oy)
                for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
                grow(b)
            }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        if cursorPx > 0, let d = drawn {   // our pointer: its old box back to the screen
            let b = pointerBox(d)
            for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
            grow(b)
        }
        if let d = drawn, d.x != p?.x || d.y != p?.y {   // where it was: its trail
            let b = pointerBox(d)
            for ty in (b.1 / TH)..<min(tilesY, (b.3 + TH - 1) / TH) { for tx in (b.0 / TW)..<min(tilesX, (b.2 + TW - 1) / TW) { trailTiles[ty * tilesX + tx] = true } }
            lastMove = now()
        }
        if cursorPx > 0, let p { drawPointer(p); grow(pointerBox(p)) }
        drawn = p
        if pb == nil && cursorPx == 0 { continue }   // macOS draws the pointer: its move comes as a frame
        if box.x1 > box.x0 && box.y1 > box.y0 { dither(box.x0, box.y0, box.x1, box.y1) }
        let t1 = now()
        // the first frame goes out whole: the tablet still shows Sidecar's own page, not white
        let mask = firstFrame && pb != nil ? [Bool](repeating: true, count: tilesX * tilesY)
                 : box.x1 > box.x0 ? changed(box.x0, box.y0, box.x1, box.y1) : [Bool](repeating: false, count: tilesX * tilesY)
        if pb != nil { firstFrame = false }
        let rects = rectsOf(mask)
        if !rects.isEmpty { let t = now(); for i in 0..<mask.count where mask[i] { fastTiles[i] = true; tileTime[i] = t } }
        if !rects.isEmpty && fastMode == false { writeFull(header(2, 0, 0, 0, 0, 0), 16); fastMode = true }   // moving again: the pen's waveform
        for (x, y, w, h) in rects {
            let rs = (w + 7) / 8
            var payload = [UInt8](repeating: 0, count: rs * h)
            for j in 0..<h { let o = (y + j) * stride + x / 8; payload.replaceSubrange(j * rs..<(j + 1) * rs, with: cur[o..<(o + rs)]) }
            writeFull(header(1, x, y, w, h, payload.count), 16); writeFull(payload, payload.count)
            stats.bytes += payload.count + 16
        }
        let t2 = now()
        for _ in rects { acks.wait() }
        for i in 0..<prev.count where prev[i] != cur[i] { dirty[i] |= prev[i] ^ cur[i]; prev[i] = cur[i] }
        if firstFull && pb != nil {   // the session's first picture: a full refresh, and nothing left to clean
            writeFull(header(3, 0, 0, 0, 0, 0), 16); firstFull = false
            for i in 0..<dirty.count { dirty[i] = 0 }; for i in 0..<fastTiles.count { fastTiles[i] = false }
        }
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
        let rects = (info.first?[.dirtyRects] as? [NSDictionary] ?? []).compactMap { CGRect(dictionaryRepresentation: $0) }
        let changed = rects.isEmpty ? CGRect.infinite : rects.reduce(CGRect.null) { $0.union($1) }
        lock.lock(); latest = pb; frameDirty = frameDirty.union(changed); lock.unlock(); ready.signal()
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
        c.showsCursor = cursorPx == 0   // macOS's own pointer, or ours (--cursor)
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
