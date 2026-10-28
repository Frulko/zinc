// sidecar: the Mac half of Sidecar (app/sidecar is the tablet's). A virtual display at the tablet's ratio (or a mirrored display) captured by
// ScreenCaptureKit, its luma dithered to 1 bit, and only the 32x16 tiles that changed sent to the tablet's driver (display-rmpp stream.h, TCP 7710),
// one frame in flight: a frame that comes while the tablet works is replaced by the next, never queued.
//   sidecar [--host 10.11.99.1] [--native | --points WxH (Retina; default half the tablet's pixels) | --mirror <display index>] [--threshold] [--idle ms] [--trail-ms ms] [--min-clean px] [--levels black,white] [--gamma g] [--edges gain] [--cursor px] [--rotate 90|180|270] [--fast-mode 0|1|2] [--pointer-moving arrow|dot|none] [--no-ui] [--pointer-hz n] [--clean-mode 0|3|4] [--seconds N]
import Foundation
import Accelerate
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import ApplicationServices
import AppKit
import SwiftUI

var host = "10.11.99.1", points = (0, 0), native = false, mirror = -1, threshold = false, seconds = 0.0, idleMs = 1500, trailMs = 1500, minClean = -1, cursorPx = 28, cleanMode = 0, fastMode0 = 0, pointerHz = 12, moving = 1, dotPx = 8, levels = (90, 185), gamma = 1.6, edges = 10, edgeFloor = 4, rotate = 0, ui = true
var argv = CommandLine.arguments.dropFirst()
while let a = argv.popFirst() {
    switch a {
    case "--host": host = argv.popFirst()!
    case "--points": let p = argv.popFirst()!.split(separator: "x").map { Int($0)! }; points = (p[0], p[1])
    case "--native": native = true   // 1:1, not Retina: twice the room, everything half as big
    case "--mirror": mirror = Int(argv.popFirst()!)!
    case "--threshold": threshold = true
    case "--cursor": cursorPx = Int(argv.popFirst()!)!; if cursorPx > 0 { cursorPx = max(19, cursorPx) }   // the pointer's height in tablet pixels; 0: macOS draws its own into the capture
    case "--rotate": rotate = Int(argv.popFirst()!)!; if ![90, 180, 270].contains(rotate) { rotate = 0 }   // until the tablet says: 90 its top on the left, 270 on the right
    case "--edges": edges = Int(argv.popFirst()!)!   // how hard a pixel darker than its neighbours is pushed to black (0: off)
    case "--fast-mode": fastMode0 = Int(argv.popFirst()!)!   // the waveform of everything that moves: 0 UFAST, 1 FAST (DU), 2 ANIMATE (A2)
    case "--pointer-moving": moving = ["arrow": 0, "dot": 1, "none": 2][argv.popFirst()!] ?? 1   // what a moving pointer looks like: the arrow, a dot (little ink: little trail), nothing
    case "--no-ui": ui = false   // no settings window
    case "--pointer-hz": pointerHz = max(1, Int(argv.popFirst()!)!)   // pointer moves sent per second at most, the newest only: a fast update lasts ~100+ ms on the panel
    case "--clean-mode": cleanMode = Int(argv.popFirst()!)!   // 0: the clean pass stays in the fast waveform (no switch); 3 or 4: true greys in xochitl's page or UI one
    case "--levels": let l = argv.popFirst()!.split(separator: ",").map { Int($0)! }; levels = (l[0], l[1])   // the tone curve's black and white points
    case "--gamma": gamma = Double(argv.popFirst()!)!
    case "--min-clean": minClean = Int(argv.popFirst()!)!   // pixels drawn fast, at rest, before the clean pass in true greys (default 1% of the panel)
    case "--trail-ms": trailMs = Int(argv.popFirst()!)!   // ms after the pointer left a tile before its trail is cleaned: a fast update drives its pixels ~1.4 s, cleaning earlier disturbs them
    case "--idle": idleMs = Int(argv.popFirst()!)!   // ms without change before the clean pass; 0: never
    case "--seconds": seconds = Double(argv.popFirst()!)!
    default: fputs("sidecar [--host h] [--native | --points WxH | --mirror n] [--threshold] [--idle ms] [--trail-ms ms] [--min-clean px] [--levels black,white] [--gamma g] [--edges gain] [--cursor px] [--rotate 90|180|270] [--fast-mode 0|1|2] [--pointer-moving arrow|dot|none] [--no-ui] [--pointer-hz n] [--clean-mode 0|3|4] [--seconds N]\n", stderr); exit(2)
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
var (FW, FH) = rotate == 90 || rotate == 270 ? (H, W) : (W, H)   // the panel as the Mac sees it: sideways when the tablet is
print("tablet: \(hello[3...].joined(separator: " ")) \(W)x\(H)")
func header(_ type: UInt8, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ len: Int) -> [UInt8] {
    var b = [UInt8](repeating: 0, count: 16); b[0] = type; b[1] = 1
    for (i, v) in [x, y, w, h].enumerated() { b[2 + i * 2] = UInt8(v & 255); b[3 + i * 2] = UInt8(v >> 8) }
    for i in 0..<4 { b[12 + i] = UInt8((len >> (i * 8)) & 255) }
    return b
}
writeFull(header(2, fastMode0, 0, 0, 0, 0), 16)   // UFAST (mode 0)
if points.0 == 0 { points = native ? (FW, FH) : (FW / 2, FH / 2) }   // Retina by default: the tablet's pixels at twice the points

// --- the tablet's messages: answers to RECTs, and its touches and Marker, played on the Mac as the mouse
let acks = DispatchSemaphore(value: 0)
var touchId = -1
func play(_ type: Int, _ id: Int, _ x: Int, _ y: Int, _ pressure: Int) {
    let b = CGDisplayBounds(target), r = region, f = toFrame(x, y)
    let at = CGPoint(x: b.minX + Double(f.0) * b.width / Double(r.fw), y: b.minY + Double(f.1) * b.height / Double(r.fh))
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
        else if m[0] == 4 {   // the room on the tablet changed (xochitl's header came or went): start again at its new size
            print("the tablet's room is now \(i(4))x\(i(8)): starting again")
            close(sock); usleep(300_000)
            let args = CommandLine.arguments.map { strdup($0) } + [nil]
            execv(CommandLine.arguments[0], args); die("cannot start again")
        }
        else if m[0] == 5 { lock.lock(); fullAt = now(); lock.unlock(); ready.signal() }   // a full refresh started on the tablet
        else if m[0] == 3 { lock.lock(); pendingTurn = i(4); lock.unlock(); ready.signal() }   // the tablet turned
        else if m[0] == 2 { let t = Int(m[1]), id = Int(m[2]) | Int(m[3]) << 8, x = i(4), y = i(8), p = i(12); DispatchQueue.main.async { play(t, id, x, y, p) } }
    }
}.start()
if !AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) {
    print("the tablet's touches need the Accessibility permission (System Settings › Privacy & Security › Accessibility) for this terminal")
}

// --- the display
/** The virtual display's one mode, the asked one: given several, macOS picks its own and refuses CGDisplaySetDisplayMode on the others
 *  (error 1001). HiDPI: the mode is in points, drawn at twice that (Retina); without it, one point is one pixel. */
func applyMode() {
    let s = CGVirtualDisplaySettings(); s.hiDPI = native ? 0 : 1
    s.modes = [CGVirtualDisplayMode(width: UInt(points.0), height: UInt(points.1), refreshRate: 60)]
    if virtualDisplay?.apply(s) == false { die("the virtual display refused its mode") }
}
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
    d.maxPixelsWide = UInt32(max(points.0, points.1) * room); d.maxPixelsHigh = d.maxPixelsWide   // either way up: the tablet turns
    // the panel is 229 ppi; macOS picks its default mode from the density, so 1:1 claims a desktop screen's (110 ppi) to keep its pixels
    let ppi = native ? 110.0 : 229.0
    d.sizeInMillimeters = CGSize(width: Double(FW) / ppi * 25.4, height: Double(FH) / ppi * 25.4)
    d.vendorID = 0x524D; d.productID = 0x5050; d.serialNum = 1   // macOS 14 needs a non-zero vendor and a serial
    d.terminationHandler = { _, _ in }
    guard let vd = CGVirtualDisplay(descriptor: d) else { die("no virtual display (macOS refused it)") }
    virtualDisplay = vd; target = vd.displayID
    applyMode()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
        if let m = CGDisplayCopyDisplayMode(target) { print("display \(target): \(m.width)x\(m.height) points, \(m.pixelWidth)x\(m.pixelHeight) pixels") }
    }
}

// --- the e-ink tone curve: the panel shows two levels while things move, so what is nearly white (a window's background, a light grey bar)
// goes to white and what is nearly black (text) to black, before the dither; only true middle tones (pictures) keep a pattern.
// --levels black,white (default 90,185): the luma at and under black is black, at and over white is white; --gamma (1.6) bends the line between.
func makeTone() -> [UInt8] {
    (0..<256).map { v in
        let t = max(0, min(1, (Double(v) - Double(levels.0)) / Double(max(1, levels.1 - levels.0))))
        return UInt8((pow(t, gamma) * 255).rounded())   // gamma over 1 darkens the middle: thin text gets thicker
    }
}
var tone = makeTone()
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
        let step = rotate == 90 ? W : rotate == 270 ? -W : rotate == 180 ? -1 : 1   // the next frame pixel of a row, on the panel
        for y in 0..<bh {
            let (px, py) = toPanel(b.0, b.1 + y)
            let s = src + (b.1 + y) * bpr + b.0, d = g.baseAddress! + py * W + px, mx = m.baseAddress! + y * bw
            if edges == 0 { for x in 0..<bw { d[x * step] = t[Int(s[x])] }; continue }
            for x in 0..<bw { let v = Int(s[x]); d[x * step] = UInt8(max(0, Int(t[v]) - max(0, Int(mx[x]) - v - edgeFloor) * edges)) }
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
var fullAt = -1e9   // when the tablet's last full refresh started: what was sent during it goes again after
var pendingTurn = -1   // the way up the tablet last sent, until the sender takes it
var latest: CVPixelBuffer?, frameDirty = CGRect.null   // the newest frame, and what changed since the last one taken (frame pixels)
let bayer: [UInt8] = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
                      3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
func makeThr() -> [UInt8] { threshold ? [UInt8](repeating: 128, count: 64) : bayer.map { UInt8(Int($0) * 4 + 2) } }
var thr = makeThr()
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

/** Of the tiles in mask, those whose picture changed since the full refresh began (fullSnapshot: the picture then). */
var fullSnapshot: [UInt8] = []
func changedSince(_ mask: [Bool]) -> [Bool] {
    guard fullSnapshot.count == cur.count else { return mask }
    var m = mask
    for ty in 0..<tilesY { for tx in 0..<tilesX where m[ty * tilesX + tx] {
        var diff = false
        for y in (ty * TH)..<min(H, (ty + 1) * TH) where !diff { let o = y * stride; for i in (tx * TW / 8)..<min(stride, (tx + 1) * TW / 8) where cur[o + i] != fullSnapshot[o + i] { diff = true; break } }
        m[ty * tilesX + tx] = diff
    } }
    return m
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
var trailTime = tileTime   // when the pointer last left each tile: its trail goes 150 ms after, while the pointer moves on (a tail, not a smear)
var lastCheck = 0.0
var fastMode = true, cleaned = 0, lastMove = 0.0
var backToFast = 0.0   // when the clean pass's waveform gives way to the fast one again
/** Cleans the tiles of mask. fast: the pointer's trail, all in the fast waveform (no waveform switch: the next move starts at once). */
func clean(_ mask: inout [Bool], fast: Bool = false) {
    let rects = rectsOf(mask)
    mask = [Bool](repeating: false, count: tilesX * tilesY)
    if rects.isEmpty { return }
    func greys(_ x: Int, _ y: Int, _ w: Int, _ h: Int) {
        var payload = [UInt8](repeating: 0, count: w * h)
        for j in 0..<h { let o = (y + j) * W + x; payload.replaceSubrange(j * w..<(j + 1) * w, with: shown[o..<(o + w)]) }
        var hd = header(1, x, y, w, h, payload.count); hd[1] = 8
        writeFull(hd, 16); writeFull(payload, payload.count)
    }
    if !fast && rects.reduce(0, { $0 + $1.2 * $1.3 }) * 3 >= W * H {   // much of the screen: one full refresh is one flash, and cleaner
        for (x, y, w, h) in rects { greys(x, y, w, h) }
        for _ in rects { acks.wait() }
        writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0
        for i in 0..<dirty.count { dirty[i] = 0 }
        return
    }
    // a partial update drives only the pixels whose value changes, and a trail's are white already: the pixels drawn fast go black first,
    // in the fast waveform, so that they move again (the local flash of xochitl's eraser, on the strokes only), then the real content
    if !fastMode { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }
    for (x, y, w, h) in rects {
        let rs = (w + 7) / 8
        var black = [UInt8](repeating: 0, count: rs * h)
        for j in 0..<h { let o = (y + j) * stride + x / 8; for i in 0..<rs { black[j * rs + i] = cur[o + i] | dirty[o + i]; dirty[o + i] = 0 } }
        writeFull(header(1, x, y, w, h, black.count), 16); writeFull(black, black.count)
    }
    for _ in rects { acks.wait() }
    // and back in black and white, still fast: twice driven, the trail goes. A waveform switch costs more than it gives: xochitl repaints
    // the whole window in the new waveform (the panel driven ~1.3 s, measured 2026-10-28), and a move then waits behind it
    if fast || cleanMode == 0 {
        for (x, y, w, h) in rects {
            let rs = (w + 7) / 8
            var bits = [UInt8](repeating: 0, count: rs * h)
            for j in 0..<h { let o = (y + j) * stride + x / 8; bits.replaceSubrange(j * rs..<(j + 1) * rs, with: cur[o..<(o + rs)]) }
            writeFull(header(1, x, y, w, h, bits.count), 16); writeFull(bits, bits.count)
        }
        for _ in rects { acks.wait() }
        return
    }
    writeFull(header(2, cleanMode, 0, 0, 0, 0), 16); fastMode = false
    for (x, y, w, h) in rects { cleaned += w * h; greys(x, y, w, h); acks.wait() }
    backToFast = now() + 150   // not at once: the greys must go out in their own waveform first
    if cleaned > W * H * 4 { writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0 }
}

// --- the pointer: drawn here, not captured: a white arrow with a black outline (little black, so little ghosting) and a white edge; it
// moves without a new frame of the screen, and only its old and new boxes are dithered and compared again
let arrow: [(Double, Double)] = [(0, 0), (0, 16), (4, 12.3), (7, 19), (9.2, 18), (6.3, 11.3), (11.5, 11.3)]   // 19 units tall, tip at (0, 0)
var pointer: (x: Int, y: Int)? = nil   // in the tablet's pixels, nil off the display
var region = (ox: 0, oy: 0, fw: FW, fh: FH)   // where the captured frame lands on the tablet, and its size
/** A pixel of the captured frame -> the panel's, turned by --rotate. */
func toPanel(_ fx: Int, _ fy: Int) -> (Int, Int) {
    let r = region
    switch rotate {
    case 90: return (r.ox + r.fh - 1 - fy, r.oy + fx)
    case 180: return (r.ox + r.fw - 1 - fx, r.oy + r.fh - 1 - fy)
    case 270: return (r.ox + fy, r.oy + r.fw - 1 - fx)
    default: return (r.ox + fx, r.oy + fy)
    }
}
func toFrame(_ px: Int, _ py: Int) -> (Int, Int) {
    let r = region, x = px - r.ox, y = py - r.oy
    switch rotate { case 90: return (y, r.fh - 1 - x); case 180: return (r.fw - 1 - x, r.fh - 1 - y); case 270: return (r.fw - 1 - y, x); default: return (x, y) }
}
/** A box (x0, y0, x1, y1) through one of them. */
func mapBox(_ b: (Int, Int, Int, Int), _ f: (Int, Int) -> (Int, Int)) -> (Int, Int, Int, Int) {
    let a = f(b.0, b.1), c = f(b.2 - 1, b.3 - 1)
    return (min(a.0, c.0), min(a.1, c.1), max(a.0, c.0) + 1, max(a.1, c.1) + 1)
}
func inside(_ px: Double, _ py: Double) -> Bool {
    var c = false
    for i in 0..<arrow.count {
        let (xi, yi) = arrow[i], (xj, yj) = arrow[(i + arrow.count - 1) % arrow.count]
        if (yi > py) != (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi { c.toggle() }
    }
    return c
}
let edge = 2
// the arrow's mask at --cursor pixels tall: 2 black (its outline), 1 white (inside, and its edge outside), 0 outside; tip at (edge, edge)
func makeArrow() -> (w: Int, h: Int, m: [UInt8]) {
    let k = Double(max(cursorPx, 19)) / 19, e = edge, w = Int(12 * k) + 2 * e, h = max(cursorPx, 19) + 2 * e
    let t = max(2, cursorPx / 12)   // the outline's width
    var m = [UInt8](repeating: 0, count: w * h)
    for y in 0..<h { for x in 0..<w where inside((Double(x - e) + 0.5) / k, (Double(y - e) + 0.5) / k) { m[y * w + x] = 1 } }
    func near(_ x: Int, _ y: Int, _ r: Int, _ v: UInt8) -> Bool {   // a pixel within r whose mask is v (outside the box counts as 0)
        for dy in -r...r { for dx in -r...r where dx * dx + dy * dy <= r * r {
            let xx = x + dx, yy = y + dy, mv: UInt8 = xx >= 0 && yy >= 0 && xx < w && yy < h ? m[yy * w + xx] : 0
            if mv == v { return true } } }
        return false
    }
    var out = m
    for y in 0..<h { for x in 0..<w {
        if m[y * w + x] == 1 { if near(x, y, t, 0) { out[y * w + x] = 2 } } else if near(x, y, e - 1, 1) { out[y * w + x] = 1 }
    } }
    return (w, h, out)
}
/** A round dot dotPx wide, black with a white edge, its middle at (r, r). */
func makeDot() -> (w: Int, h: Int, m: [UInt8], tx: Int, ty: Int) {
    let r = dotPx / 2 + 1, w = 2 * r + 1
    var m = [UInt8](repeating: 0, count: w * w)
    for y in 0..<w { for x in 0..<w { let d2 = (x - r) * (x - r) + (y - r) * (y - r)
        m[y * w + x] = d2 <= (dotPx / 2) * (dotPx / 2) ? 2 : d2 <= r * r ? 1 : 0 } }
    return (w, w, m, r, r)
}
var uprightMask = makeArrow()
/** The arrow as the panel shows it, turned with the picture, and where its tip is in it. */
func turnedMask() -> (w: Int, h: Int, m: [UInt8], tx: Int, ty: Int) {
    let u = uprightMask, sideways = rotate == 90 || rotate == 270
    let (w, h) = sideways ? (u.h, u.w) : (u.w, u.h)
    func at(_ x: Int, _ y: Int) -> (Int, Int) {   // as toPanel turns a frame's pixel
        switch rotate { case 90: return (u.h - 1 - y, x); case 180: return (u.w - 1 - x, u.h - 1 - y); case 270: return (y, u.w - 1 - x); default: return (x, y) }
    }
    var m = [UInt8](repeating: 0, count: w * h)
    for y in 0..<u.h { for x in 0..<u.w { let (px, py) = at(x, y); m[py * w + px] = u.m[y * u.w + x] } }
    let tip = at(edge, edge)
    return (w, h, m, tip.0, tip.1)
}
var pointerMask = turnedMask(), dotMask = makeDot()
func pointerBox(_ p: (x: Int, y: Int), dot: Bool = false) -> (Int, Int, Int, Int) {
    if cursorPx == 0 { return (max(0, p.x - 72), max(0, p.y - 72), min(W, p.x + 72), min(H, p.y + 72)) }   // macOS's arrow and its shadow, Retina, any way up
    let pm = dot ? dotMask : pointerMask
    return (max(0, p.x - pm.tx), max(0, p.y - pm.ty), min(W, p.x - pm.tx + pm.w), min(H, p.y - pm.ty + pm.h))
}
func drawPointer(_ p: (x: Int, y: Int), dot: Bool = false) {
    let pm = dot ? dotMask : pointerMask
    for y in 0..<pm.h { let yy = p.y - pm.ty + y; if yy < 0 || yy >= H { continue }
        for x in 0..<pm.w where pm.m[y * pm.w + x] != 0 { let xx = p.x - pm.tx + x; if xx >= 0 && xx < W { shown[yy * W + xx] = pm.m[y * pm.w + x] == 2 ? 0 : 255 } } }
}
func pointerNow() -> (x: Int, y: Int)? {
    guard let loc = CGEvent(source: nil)?.location else { return nil }
    let b = CGDisplayBounds(target)
    guard b.contains(loc) else { return nil }
    return toPanel(Int((loc.x - b.minX) * Double(region.fw) / b.width), Int((loc.y - b.minY) * Double(region.fh) / b.height))
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

// --- live settings: the window (below) sets them, the sender takes them between two frames
struct Tune: Equatable {
    var black = 90.0, white = 185.0, gamma = 1.6, edges = 10.0, edgeFloor = 4.0, dither = true
    var cursor = 28.0, moving = 1, dot = 8.0, pointerHz = 12.0, trail = 1500.0
    var fastMode = 0, idle = 1500.0, minClean = 1.0, greys = false
}
/** The settings as the command line left them. */
func currentTune() -> Tune {
    Tune(black: Double(levels.0), white: Double(levels.1), gamma: gamma, edges: Double(edges), edgeFloor: Double(edgeFloor), dither: !threshold,
         cursor: Double(cursorPx), moving: moving, dot: Double(dotPx), pointerHz: Double(pointerHz), trail: Double(trailMs),
         fastMode: fastMode0, idle: Double(idleMs), minClean: minClean < 0 ? 1.0 : Double(minClean) * 100 / Double(W * H), greys: cleanMode != 0)
}
var pendingTune: Tune?, pendingAction = ""   // "full" or "clean"
var reshade = false   // the tone changed: the whole frame goes through it again
func apply(_ t: Tune) {
    let shader = Int(t.black) != levels.0 || Int(t.white) != levels.1 || t.gamma != gamma || Int(t.edges) != edges || Int(t.edgeFloor) != edgeFloor || t.dither == threshold
    let look = Int(t.cursor) != cursorPx || Int(t.dot) != dotPx
    levels = (Int(t.black), max(Int(t.black) + 1, Int(t.white))); gamma = t.gamma; edges = Int(t.edges); edgeFloor = Int(t.edgeFloor); threshold = !t.dither
    if cursorPx > 0 { cursorPx = Int(t.cursor) }
    moving = t.moving; dotPx = Int(t.dot); pointerHz = max(1, Int(t.pointerHz)); trailMs = Int(t.trail)
    idleMs = Int(t.idle); minClean = Int(t.minClean * Double(W * H) / 100); cleanMode = t.greys ? 3 : 0
    if t.fastMode != fastMode0 { fastMode0 = t.fastMode; writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }
    if shader { tone = makeTone(); thr = makeThr() }
    if look { uprightMask = makeArrow(); pointerMask = turnedMask(); dotMask = makeDot() }
    if shader || look { reshade = true }
}

var cursorArea = CGRect.null   // frame pixels: where macOS's pointer has been since the last frame taken
func addCursor(_ p: (x: Int, y: Int)) {
    let b = mapBox(pointerBox(p), toFrame)
    cursorArea = cursorArea.union(CGRect(x: b.0, y: b.1, width: b.2 - b.0, height: b.3 - b.1))
}
Thread {
    var drawn: (x: Int, y: Int)? = nil, drawnDot = false   // where the pointer is drawn in shown, and as what
    var held: CVPixelBuffer?   // the last frame: a change of the shader goes through it again
    var lastFull = -1e9, resyncAt = -1.0   // the last full refresh seen, and when what changed during it goes again
    var lastPointer = 0.0, deferred = false   // when the pointer last went out; a move waits for its turn
    func any(_ m: [Bool]) -> Bool { m.contains(true) }
    while true {
        if deferred { _ = ready.wait(timeout: .now() + .milliseconds(5)) }
        else if resyncAt > 0 { _ = ready.wait(timeout: .now() + .milliseconds(20)) }
        else if now() - lastPointer < 400 { _ = ready.wait(timeout: .now() + .milliseconds(20)) }   // to draw the arrow once it stops
        else if (idleMs > 0 && any(fastTiles)) || any(trailTiles) || !fastMode { _ = ready.wait(timeout: .now() + .milliseconds(30)) } else { ready.wait() }
        let tn = now()
        if !fastMode && tn >= backToFast { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }   // ready before the next move
        lock.lock(); let tune = pendingTune, action = pendingAction, fa = fullAt; pendingTune = nil; pendingAction = ""; lock.unlock()
        // a full refresh repaints the panel for ~1.4 s: what changed meanwhile may not stay, so all of it goes again once it is over
        if fa != lastFull { lastFull = fa; fullSnapshot = cur; resyncAt = fa + 1600 }
        if resyncAt > 0 && now() >= resyncAt {
            resyncAt = -1
            let rects = rectsOf(changedSince([Bool](repeating: true, count: tilesX * tilesY)))
            for (x, y, w, h) in rects {
                let rs = (w + 7) / 8
                var payload = [UInt8](repeating: 0, count: rs * h)
                for j in 0..<h { let o = (y + j) * stride + x / 8; payload.replaceSubrange(j * rs..<(j + 1) * rs, with: cur[o..<(o + rs)]) }
                writeFull(header(1, x, y, w, h, payload.count), 16); writeFull(payload, payload.count)
            }
            for _ in rects { acks.wait() }
        }
        if let tune { apply(tune) }
        if action == "full" { writeFull(header(3, 0, 0, 0, 0, 0), 16); for i in 0..<dirty.count { dirty[i] = 0 }; for i in 0..<fastTiles.count { fastTiles[i] = false; trailTiles[i] = false } }
        if action == "clean" { var all = fastTiles; for i in 0..<all.count { all[i] = all[i] || trailTiles[i]; fastTiles[i] = false; trailTiles[i] = false }; clean(&all) }
        let under = drawn.map { pointerBox($0, dot: drawnDot) }.map { b in (b.0 / TW, b.1 / TH, (b.2 - 1) / TW, (b.3 - 1) / TH) } ?? (-1, -1, -2, -2)
        func isUnder(_ tx: Int, _ ty: Int) -> Bool { tx >= under.0 && tx <= under.2 && ty >= under.1 && ty <= under.3 }
        if any(trailTiles) {   // the pointer's tail: the tiles it left --trail-ms ago, once their pixels rest, in the fast waveform, while it moves on
            var tail = [Bool](repeating: false, count: trailTiles.count)
            for ty in 0..<tilesY { for tx in 0..<tilesX where trailTiles[ty * tilesX + tx] && tn - trailTime[ty * tilesX + tx] >= Double(trailMs) && !isUnder(tx, ty) {
                tail[ty * tilesX + tx] = true; trailTiles[ty * tilesX + tx] = false
            } }
            if any(tail) { clean(&tail, fast: true) }
        }
        // the tiles at rest, in true greys, once enough was drawn fast to be worth a flash (a clock, a caret, a menu bar icon never are);
        // not those around the pointer: a move there would wait for the slow waveform to end
        if idleMs > 0 && tn - lastMove >= 300 && tn - lastCheck >= 250 {
            lastCheck = tn
            let near = drawn.map { d in (max(0, d.x - 96) / TW, max(0, d.y - 96) / TH, (d.x + 96) / TW, (d.y + 96) / TH) } ?? (-1, -1, -2, -2)
            var rested = [Bool](repeating: false, count: fastTiles.count), count = 0
            for ty in 0..<tilesY { for tx in 0..<tilesX where fastTiles[ty * tilesX + tx] && tn - tileTime[ty * tilesX + tx] >= Double(idleMs) {
                if tx >= near.0 && tx <= near.2 && ty >= near.1 && ty <= near.3 { continue }
                rested[ty * tilesX + tx] = true
                for y in (ty * TH)..<min(H, (ty + 1) * TH) { let o = y * stride; for i in (tx * TW / 8)..<min(stride, (tx + 1) * TW / 8) { count += dirty[o + i].nonzeroBitCount } }
            } }
            if count >= (minClean < 0 ? W * H / 100 : minClean) {
                for i in 0..<rested.count where rested[i] { fastTiles[i] = false }
                clean(&rested)
            }
        }
        lock.lock(); let to = pendingTurn; pendingTurn = -1; lock.unlock()
        if to >= 0 && to != rotate {   // the tablet turned: the display and the capture take its shape, then a whole first frame
            let side = (to == 90 || to == 270) != (rotate == 90 || rotate == 270)
            rotate = to; firstFrame = true; firstFull = true; cursorArea = .null; pointerMask = turnedMask()
            if side { (FW, FH) = (FH, FW); if mirror < 0 { points = (points.1, points.0) } }
            print("the tablet turned: \(to)")
            if side { DispatchQueue.main.async { applyMode(); reconfigure() } }
        }
        lock.lock(); var pb = latest, fd = frameDirty; latest = nil; frameDirty = .null; var moved = pointerMoved; pointerMoved = false; let p = pointer; lock.unlock()
        if pb != nil { held = pb } else if reshade, let h = held { pb = h; fd = .infinite }
        reshade = false
        // the pointer alone: at most --pointer-hz moves, the newest; updates that overlap on the panel wait for each other there
        if moved && pb == nil && now() - lastPointer < 1000 / Double(pointerHz) { lock.lock(); pointerMoved = true; lock.unlock(); moved = false; deferred = true; continue }
        deferred = false
        if moved { lastPointer = now() }
        // a moving pointer leaves a trail on e-ink whatever is done after: while it moves it is --pointer-moving (by default a dot, little
        // ink), and the arrow comes back sharp 120 ms after it stops
        let isMoving = cursorPx > 0 && now() - lastPointer < 120
        let q = isMoving && moving == 2 ? nil : p, qDot = isMoving && moving == 1
        if pb == nil && !moved && q?.x == drawn?.x && q?.y == drawn?.y && qDot == drawnDot { continue }
        let t0 = now()
        var box = (x0: W, y0: H, x1: 0, y1: 0)   // what to dither and compare
        func grow(_ b: (Int, Int, Int, Int)) { box = (min(box.x0, b.0), min(box.y0, b.1), max(box.x1, b.2), max(box.y1, b.3)) }
        if let pb {   // a new frame: what changed in it (all of it when its place moved), through the shader into grey and shown
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            if CVPixelBufferGetWidthOfPlane(pb, 0) != captureSize().0 || CVPixelBufferGetHeightOfPlane(pb, 0) != captureSize().1 { CVPixelBufferUnlockBaseAddress(pb, .readOnly); held = nil; continue }   // before a turn
            let fw = min(CVPixelBufferGetWidthOfPlane(pb, 0), FW), fh = min(CVPixelBufferGetHeightOfPlane(pb, 0), FH), bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
            let (pw, ph) = rotate == 90 || rotate == 270 ? (fh, fw) : (fw, fh)
            let reg = ((W - pw) / 2 / 8 * 8, (H - ph) / 2, fw, fh)
            var d = (0, 0, fw, fh)
            if !firstFrame && reg == (region.ox, region.oy, region.fw, region.fh) && !fd.isNull && !fd.isInfinite {
                // macOS's pointer is in the frame but not in its dirty rects: where it was and is goes again
                let c = cursorArea.isNull ? fd : fd.union(cursorArea)
                d = (max(0, Int(c.minX) - 2), max(0, Int(c.minY) - 2), min(fw, Int(c.maxX.rounded(.up)) + 2), min(fh, Int(c.maxY.rounded(.up)) + 2))   // 2 more: the edges reach that far
            }
            region = (reg.0, reg.1, reg.2, reg.3)
            cursorArea = .null; if cursorPx == 0, let p { addCursor(p) }   // the frame may be older than the pointer: its place goes again next time
            let src = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
            if d.2 > d.0 && d.3 > d.1 {
                shade(src, bpr, fw, fh, d)
                let b = mapBox(d, toPanel)
                for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
                grow(b)
            }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        if cursorPx > 0, let d = drawn {   // our pointer: its old box back to the screen
            let b = pointerBox(d, dot: drawnDot)
            for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
            grow(b)
        }
        if cursorPx == 0 && moved { if let d = drawn { addCursor(d) }; if let p { addCursor(p) } }
        if let d = drawn, d.x != q?.x || d.y != q?.y || drawnDot != qDot {   // where it was: its trail
            let b = pointerBox(d, dot: drawnDot)
            for ty in (b.1 / TH)..<min(tilesY, (b.3 + TH - 1) / TH) { for tx in (b.0 / TW)..<min(tilesX, (b.2 + TW - 1) / TW) { trailTiles[ty * tilesX + tx] = true; trailTime[ty * tilesX + tx] = now() } }
            lastMove = now()
        }
        if cursorPx > 0, let q { drawPointer(q, dot: qDot); grow(pointerBox(q, dot: qDot)) }
        drawn = q; drawnDot = qDot
        if pb == nil && cursorPx == 0 { continue }   // macOS draws the pointer: its move comes as a frame
        if box.x1 > box.x0 && box.y1 > box.y0 { dither(box.x0, box.y0, box.x1, box.y1) }
        let t1 = now()
        // the first frame goes out whole: the tablet still shows Sidecar's own page, not white
        let mask = firstFrame && pb != nil ? [Bool](repeating: true, count: tilesX * tilesY)
                 : box.x1 > box.x0 ? changed(box.x0, box.y0, box.x1, box.y1) : [Bool](repeating: false, count: tilesX * tilesY)
        if pb != nil { firstFrame = false }
        let rects = rectsOf(mask)
        if !rects.isEmpty { let t = now(); for i in 0..<mask.count where mask[i] { fastTiles[i] = true; tileTime[i] = t } }
        if !rects.isEmpty && fastMode == false { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }   // moving again: the pen's waveform
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
            let line = String(format: "%5.1f frames/s  %4.1f rects/frame  %6.0f KB/s  dither+diff %4.1f ms  tablet %4.1f ms", Double(stats.frames) / (now() - stats.t) * 1000,
                         Double(stats.rects) / Double(f), Double(stats.bytes) / (now() - stats.t), stats.dither / Double(f), stats.wait / Double(f))
            print(line)
            DispatchQueue.main.async { panel.stats = line }
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
var stream: SCStream?, captured: SCDisplay?
/** The capture's size: the panel's pixels (as the Mac sees it), the display's aspect kept (a mirrored display gets white bands). */
func captureSize() -> (Int, Int) {
    let (w, h) = mirror >= 0 ? (captured?.width ?? FW, captured?.height ?? FH) : points
    let k = min(Double(FW) / Double(w), Double(FH) / Double(h))
    return (Int(Double(w) * k), Int(Double(h) * k))
}
func config() -> SCStreamConfiguration {
    let c = SCStreamConfiguration()
    (c.width, c.height) = captureSize()
    c.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarFullRange   // plane 0 is the luma: grey with no conversion
    c.minimumFrameInterval = CMTime(value: 1, timescale: 60)
    c.queueDepth = 3
    c.showsCursor = cursorPx == 0   // macOS's own pointer, or ours (--cursor)
    return c
}
func reconfigure() { stream?.updateConfiguration(config()) { e in if let e { print("sidecar: capture: \(e.localizedDescription)") } } }
func startCapture(_ tries: Int) {
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, err in
        guard let display = content?.displays.first(where: { $0.displayID == target }) else {
            if tries > 20 { die("display not shareable: \(err?.localizedDescription ?? "not found") (Screen Recording permission?)") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { startCapture(tries + 1) }; return
        }
        captured = display
        let c = config()
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: c, delegate: out)
        do { try s.addStreamOutput(out, type: .screen, sampleHandlerQueue: DispatchQueue(label: "capture")) } catch { die("\(error)") }
        s.startCapture { e in if let e { die("capture: \(e.localizedDescription)") }; print("capturing \(c.width)x\(c.height)") }
        stream = s
    }
}
startCapture(0)
if seconds > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { writeFull(header(3, 0, 0, 0, 0, 0), 16); exit(0) } }
signal(SIGINT) { _ in exit(0) }

// --- the settings window: every knob live, while the tablet shows the result
final class Panel: ObservableObject {
    @Published var tune = currentTune() { didSet { if tune != oldValue { lock.lock(); pendingTune = tune; lock.unlock(); ready.signal() } } }
    @Published var stats = ""
    func act(_ a: String) { lock.lock(); pendingAction = a; lock.unlock(); ready.signal() }
}
let panel = Panel()
struct Knob: View {
    let name: String; @Binding var value: Double; let range: ClosedRange<Double>; var step = 1.0; var unit = ""
    var body: some View {
        HStack {
            Text(name).frame(width: 130, alignment: .leading)
            Slider(value: $value, in: range, step: step)
            Text(step < 1 ? String(format: "%.2f", value) : "\(Int(value))\(unit)").monospacedDigit().frame(width: 64, alignment: .trailing)
        }
    }
}
struct SettingsView: View {
    @ObservedObject var p: Panel
    var body: some View {
        Form {
            Section("Shader") {
                Knob(name: "Black point", value: $p.tune.black, range: 0...200)
                Knob(name: "White point", value: $p.tune.white, range: 100...255)
                Knob(name: "Gamma", value: $p.tune.gamma, range: 0.5...3, step: 0.05)
                Knob(name: "Edges", value: $p.tune.edges, range: 0...30)
                Knob(name: "Edge threshold", value: $p.tune.edgeFloor, range: 0...30)
                Picker("Greys", selection: $p.tune.dither) { Text("Dither").tag(true); Text("Threshold").tag(false) }.pickerStyle(.segmented)
            }
            Section("Pointer") {
                Knob(name: "Arrow", value: $p.tune.cursor, range: 19...56, unit: " px")
                Picker("While moving", selection: $p.tune.moving) { Text("Arrow").tag(0); Text("Dot").tag(1); Text("Nothing").tag(2) }.pickerStyle(.segmented)
                Knob(name: "Dot", value: $p.tune.dot, range: 3...20, unit: " px")
                Knob(name: "Moves per second", value: $p.tune.pointerHz, range: 5...120)
                Knob(name: "Trail cleaned after", value: $p.tune.trail, range: 0...3000, step: 50, unit: " ms")
            }
            Section("Refresh") {
                Picker("Fast waveform", selection: $p.tune.fastMode) { Text("UFAST").tag(0); Text("DU").tag(1); Text("A2").tag(2) }.pickerStyle(.segmented)
                Knob(name: "Clean after rest", value: $p.tune.idle, range: 0...5000, step: 100, unit: " ms")
                Knob(name: "Clean from (% screen)", value: $p.tune.minClean, range: 0.05...10, step: 0.05)
                Toggle("Clean in true greys (switches waveforms)", isOn: $p.tune.greys)
                HStack {
                    Button("Full refresh") { p.act("full") }
                    Button("Clean now") { p.act("clean") }
                    Button("Defaults") { p.tune = Tune() }
                }
            }
            Section("Live") { Text(p.stats).font(.system(.caption, design: .monospaced)) }
        }
        .formStyle(.grouped).frame(width: 520)
    }
}
if ui {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 760), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
    w.title = "Sidecar"; w.contentView = NSHostingView(rootView: SettingsView(p: panel)); w.center()
    w.orderFrontRegardless()   // shown, but the app the owner works in keeps the keyboard
    final class Quit: NSObject, NSWindowDelegate { func windowWillClose(_ n: Notification) { writeFull(header(3, 0, 0, 0, 0, 0), 16); exit(0) } }
    let quit = Quit(); w.delegate = quit
    app.run()
} else {
    dispatchMain()
}
