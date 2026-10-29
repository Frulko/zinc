// sidecar: the Mac half of Sidecar (app/sidecar is the tablet's). A virtual display at the tablet's ratio (or a mirrored display) captured by
// ScreenCaptureKit, its luma dithered to 1 bit, and only the 32x16 tiles that changed sent to the tablet's driver (display-rmpp stream.h, TCP 7710),
// one frame in flight: a frame that comes while the tablet works is replaced by the next, never queued.
//   sidecar [--host 10.11.99.1] [--native | --points WxH (Retina; default half the tablet's pixels) | --mirror <display index>] [--threshold] [--dither 0|1|2|3] [--idle ms] [--trail-ms ms] [--min-clean px] [--levels black,white] [--gamma g] [--invert 0|1|2] [--edges gain] [--cursor px] [--rotate 90|180|270] [--fast-mode 0|1|2] [--pointer-moving arrow|dot|none] [--no-ui] [--pointer-hz n] [--clean-mode 0|3|4] [--seconds N]
import Foundation
import Accelerate
import Compression
import Metal
import ScreenCaptureKit
import CoreMedia
import CoreVideo
import ApplicationServices
import AppKit
import SwiftUI

var invertMode = 1   // dark areas, see darkAround
var host = "10.11.99.1", points = (0, 0), native = false, mirror = -1, ditherKind = 3, seconds = 0.0, idleMs = 1500, trailMs = 1500, minClean = -1, cursorPx = 28, cleanMode = 0, fastMode0 = 0, pointerHz = 12, moving = 1, dotPx = 8, levels = (90, 185), gamma = 1.6, edges = 10, edgeFloor = 4, rotate = 0, ui = true, control = false, waitAlways = false
var gentle = true, tabletPen = false, rotationLock = false, selftest = false
setvbuf(stdout, nil, _IOLBF, 0)   // a line at a time, into a pipe or a file too
var argv = CommandLine.arguments.dropFirst()
while let a = argv.popFirst() {
    switch a {
    case "--host": host = argv.popFirst()!
    case "--points": let p = argv.popFirst()!.split(separator: "x").map { Int($0)! }; points = (p[0], p[1])
    case "--native": native = true   // 1:1, not Retina: twice the room, everything half as big
    case "--mirror": mirror = Int(argv.popFirst()!)!
    case "--threshold": ditherKind = 0
    case "--dither": ditherKind = Int(argv.popFirst()!)!   // 0 none, 1 Bayer, 2 blue noise everywhere, 3 blue noise on pictures only (default)
    case "--selftest": selftest = true; ui = false   // the GPU's shader against the CPU's, on made-up frames, no tablet
    case "--control": control = true   // settings as JSON lines on stdin, state on stdout: the menu bar app drives this engine
    case "--cursor": cursorPx = Int(argv.popFirst()!)!; if cursorPx > 0 { cursorPx = max(19, cursorPx) }   // the pointer's height in tablet pixels; 0: macOS draws its own into the capture
    case "--rotate": rotate = Int(argv.popFirst()!)!; if ![90, 180, 270].contains(rotate) { rotate = 0 }   // until the tablet says: 90 its top on the left, 270 on the right
    case "--edges": edges = Int(argv.popFirst()!)!   // how hard a pixel darker than its neighbours is pushed to black (0: off)
    case "--fast-mode": fastMode0 = Int(argv.popFirst()!)!   // the waveform of everything that moves: 0 UFAST, 1 FAST (DU), 2 ANIMATE (A2)
    case "--pointer-moving": moving = ["arrow": 0, "dot": 1, "none": 2][argv.popFirst()!] ?? 1   // what a moving pointer looks like: the arrow, a dot (little ink: little trail), nothing
    case "--no-ui": ui = false   // no settings window
    case "--wait": waitAlways = true   // wait for the tablet as long as it takes (the menu bar app), not 30 s
    case "--pointer-hz": pointerHz = max(1, Int(argv.popFirst()!)!)   // pointer moves sent per second at most, the newest only: a fast update lasts ~100+ ms on the panel
    case "--clean-mode": cleanMode = Int(argv.popFirst()!)!   // 0: the clean pass stays in the fast waveform (no switch); 3 or 4: true greys in xochitl's page or UI one
    case "--levels": let l = argv.popFirst()!.split(separator: ",").map { Int($0)! }; levels = (l[0], l[1])   // the tone curve's black and white points
    case "--gamma": gamma = Double(argv.popFirst()!)!
    case "--invert": invertMode = Int(argv.popFirst()!)!   // dark areas: 0 kept, 1 turned (default), 2 the whole screen
    case "--min-clean": minClean = Int(argv.popFirst()!)!   // pixels drawn fast, at rest, before the clean pass in true greys (default 1% of the panel)
    case "--trail-ms": trailMs = Int(argv.popFirst()!)!   // ms after the pointer left a tile before its trail is cleaned: a fast update drives its pixels ~1.4 s, cleaning earlier disturbs them
    case "--idle": idleMs = Int(argv.popFirst()!)!   // ms without change before the clean pass; 0: never
    case "--seconds": seconds = Double(argv.popFirst()!)!
    default: fputs("sidecar [--host h] [--native | --points WxH | --mirror n] [--threshold] [--dither 0|1|2|3] [--idle ms] [--trail-ms ms] [--min-clean px] [--levels black,white] [--gamma g] [--invert 0|1|2] [--edges gain] [--cursor px] [--rotate 90|180|270] [--fast-mode 0|1|2] [--pointer-moving arrow|dot|none] [--no-ui] [--pointer-hz n] [--clean-mode 0|3|4] [--seconds N]\n", stderr); exit(2)
    }
}
func die(_ s: String) -> Never { fputs("sidecar: \(s)\n", stderr); exit(1) }
func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }

// --- the tablet
var sock = socket(AF_INET, SOCK_STREAM, 0)
var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = in_port_t(UInt16(ProcessInfo.processInfo.environment["SIDECAR_PORT"] ?? "7710")!).bigEndian
inet_pton(AF_INET, host, &addr.sin_addr)
// the tablet may still be opening Sidecar, or coming back after its USB link dropped: tried for 30 s
var tries = 0
while !selftest, withUnsafePointer(to: &addr, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) != 0 {
    tries += 1
    if tries == 1 { print("waiting for the tablet at \(host) (open Sidecar on the reMarkable)") }
    if tries > 60 && !waitAlways { die("no tablet at \(host) (open Sidecar on the reMarkable)") }
    close(sock); usleep(500_000); sock = socket(AF_INET, SOCK_STREAM, 0)
}
var one: Int32 = 1
setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &one, socklen_t(MemoryLayout<Int32>.size))
setsockopt(sock, SOL_SOCKET, SO_KEEPALIVE, &one, socklen_t(MemoryLayout<Int32>.size))
/** The tablet went away (its USB link dropped, Sidecar closed): start again from the top, which waits for it to come back. */
func lost() -> Never {
    print("lost the tablet: connecting again")
    close(sock); usleep(1_000_000)
    let args = CommandLine.arguments.map { strdup($0) } + [nil]
    execv(CommandLine.arguments[0], args); die("cannot start again")
}
func readFull(_ p: UnsafeMutableRawPointer, _ n: Int) { var got = 0; while got < n { let r = read(sock, p + got, n - got); if r < 0 && errno == EINTR { continue }; if r <= 0 { lost() }; got += r } }
func writeFull(_ p: UnsafeRawPointer, _ n: Int) { if selftest { return }; var put = 0; while put < n { let r = write(sock, p + put, n - put); if r < 0 && errno == EINTR { continue }; if r <= 0 { lost() }; put += r } }
var line = selftest ? Array("RMPP 1620 2160 Paper Pro".utf8) : [UInt8]()
while !selftest { var c: UInt8 = 0; readFull(&c, 1); if c == 10 { break }; line.append(c) }
let hello = String(decoding: line, as: UTF8.self).split(separator: " ").filter { !$0.hasPrefix("+") }
let W = Int(hello[1])!, H = Int(hello[2])!
// what the tablet reads beyond rectangles: its own pointer (ptr), lz4 blocks, a scroll's copy
let caps = Set(String(decoding: line, as: UTF8.self).split(separator: " ").filter { $0.hasPrefix("+") }.map { String($0.dropFirst()) })
var (FW, FH) = rotate == 90 || rotate == 270 ? (H, W) : (W, H)   // the panel as the Mac sees it: sideways when the tablet is
print("tablet: \(hello[3...].joined(separator: " ")) \(W)x\(H)")
func header(_ type: UInt8, _ x: Int, _ y: Int, _ w: Int, _ h: Int, _ len: Int) -> [UInt8] {
    var b = [UInt8](repeating: 0, count: 16); b[0] = type; b[1] = 1
    for (i, v) in [x, y, w, h].enumerated() { b[2 + i * 2] = UInt8(v & 255); b[3 + i * 2] = UInt8(v >> 8) }
    for i in 0..<4 { b[12 + i] = UInt8((len >> (i * 8)) & 255) }
    return b
}
/** A rectangle's payload as the tablet reads it best: one zstd frame (+zstd), else one lz4 block (+lz4), greys Sub-filtered first (+sub);
 *  nil when it would not shrink by a tenth. zstd's entropy stage takes more out of dithered bits than lz4 (app/sidecar/mac/codecbench.swift). */
var zbuf = [UInt8](), rawBytes = 0, gpuFrames = 0   // the profile: payload before the codec, frames the GPU shaded
let zctx = ZSTD_createCCtx()
func squeeze(_ payload: [UInt8], _ w: Int, _ h: Int, depth: UInt8, caps: Set<String>) -> (UInt8, Int)? {
    guard (caps.contains("zstd") || caps.contains("lz4")) && payload.count >= 1024 else { return nil }
    let sub = depth == 8 && caps.contains("sub")
    var src = payload
    if sub { for j in 0..<h { var i = w - 1; while i >= 1 { src[j * w + i] = src[j * w + i] &- src[j * w + i - 1]; i -= 1 } } }
    let zstd = caps.contains("zstd"), bound = zstd ? ZSTD_compressBound(src.count) : src.count
    if zbuf.count < bound { zbuf = [UInt8](repeating: 0, count: bound) }
    let n = zstd ? ZSTD_compressCCtx(zctx, &zbuf, bound, src, src.count, 1) : compression_encode_buffer(&zbuf, src.count * 9 / 10, src, src.count, nil, COMPRESSION_LZ4_RAW)
    if n == 0 || (zstd && (ZSTD_isError(n) != 0 || n >= src.count * 9 / 10)) { return nil }
    return ((zstd ? 2 : 1) | (sub ? 0x80 : 0), n)
}
/** One rectangle (rows of 1-bit pixels, or greys at depth 8), compressed when the tablet reads it; more: another message of this picture
 *  follows, and the tablet updates the panel once, at the last. */
func sendRect(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ payload: [UInt8], depth: UInt8 = 1, more: Bool = false) {
    var hd = header(1, x, y, w, h, payload.count); hd[1] = depth; hd[11] = more ? 1 : 0
    rawBytes += payload.count + 16
    if let (codec, n) = squeeze(payload, w, h, depth: depth, caps: caps) {
        hd[10] = codec; for i in 0..<4 { hd[12 + i] = UInt8((n >> (i * 8)) & 255) }
        writeFull(hd, 16); zbuf.withUnsafeBytes { writeFull($0.baseAddress!, n) }; stats.bytes += n + 16
        return
    }
    writeFull(hd, 16); writeFull(payload, payload.count); stats.bytes += payload.count + 16
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
    lock.lock(); lastMouse = now(); lock.unlock()   // a finger or the Marker is the mouse too
    if !pen && kind == 0 && quickTap(f) { return }   // the quick panel takes its own taps
    if !pen && touchId == -3 { if kind == 1 { touchId = -1 }; return }
    var t: CGEventType
    switch kind {
    case 0: if touchId != -1 { return }; touchId = who; t = .leftMouseDown
    case 2: if touchId != who { return }; t = .leftMouseDragged
    case 1: if touchId != who { return }; touchId = -1; t = .leftMouseUp
    case 3: if !tabletPen || touchId != -1 { return }; t = .mouseMoved   // the Marker hovering: the pointer follows it
    default: return
    }
    if pen && tabletPen { proximity(true) }
    guard let ev = CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: at, mouseButton: .left) else { return }
    if pen { ev.setDoubleValueField(.mouseEventPressure, value: min(1, Double(pressure) / 4096)) }
    if pen && tabletPen {   // a graphics tablet's point: drawing apps read its pressure and tilt (degrees in id, turned with the picture)
        ev.setIntegerValueField(.mouseEventSubtype, value: Int64(CGEventMouseSubtype.tabletPoint.rawValue))
        ev.setDoubleValueField(.tabletEventPointPressure, value: min(1, Double(pressure) / 4096))
        let tx = Double(Int8(truncatingIfNeeded: id & 0xff)) / 90, ty = Double(Int8(truncatingIfNeeded: id >> 8)) / 90
        let o = toFrame(0, 0), v = toFrame(Int(tx * 1000), Int(ty * 1000))
        ev.setDoubleValueField(.tabletEventTiltX, value: Double(v.0 - o.0) / 1000)
        ev.setDoubleValueField(.tabletEventTiltY, value: Double(v.1 - o.1) / 1000)
        ev.setIntegerValueField(.tabletEventDeviceID, value: 1)
    }
    ev.post(tap: .cghidEventTap)
    if pen && tabletPen { penLeaveAt = now() + 600 }
}
/** A pen comes near (or leaves): drawing apps switch to their tablet input on it. */
var penNear = false, penLeaveAt = 0.0
// the tablet's schedule and profile (+sched): SET messages when a value changes; its PROFILE answers, every 2 s while it is on
var holdOn = true, holdPen = 450, holdColour = 1200, holdFull = 2500, profileOn = false, sentSched = [Int: Int](), lightTo = -1
var panelStats = [(Int, Int, Int)](repeating: (0, 0, 0), count: 3)
func sched() {
    guard caps.contains("sched") else { return }
    lock.lock(); let p = profileOn, l = lightTo; lightTo = -1; lock.unlock()
    if l >= 0 { writeFull(header(7, 6, l, 0, 0, 0), 16) }   // the frontlight, permille
    for (k, v) in [(1, holdPen), (2, holdColour), (3, holdFull), (5, holdOn ? 1 : 0), (4, p ? 1 : 0)] where sentSched[k] != v {
        writeFull(header(7, k, min(v, 65535), 0, 0, 0), 16); sentSched[k] = v
    }
}
func proximity(_ near: Bool) {
    if near == penNear { return }
    penNear = near
    guard let e = CGEvent(source: nil) else { return }
    e.type = .tabletProximity
    e.setIntegerValueField(.tabletProximityEventEnterProximity, value: near ? 1 : 0)
    e.setIntegerValueField(.tabletProximityEventPointerType, value: 1)   // NSPointingDeviceTypePen
    e.setIntegerValueField(.tabletProximityEventDeviceID, value: 1)
    e.setIntegerValueField(.tabletProximityEventCapabilityMask, value: 0x0400 | 0x0200 | 0x0100 | 0x0003)   // pressure, tilt, x/y
    e.post(tap: .cghidEventTap)
}
/** Two fingers on the tablet: the page follows them (as a trackpad's natural scrolling), turned with the picture, in points. */
var scrollRest = (0.0, 0.0)
func scroll(_ dx: Int, _ dy: Int) {
    let b = CGDisplayBounds(target), r = region, o = toFrame(0, 0), f = toFrame(dx, dy)
    scrollRest.0 += Double(f.0 - o.0) * b.width / Double(r.fw) / 2
    scrollRest.1 += Double(f.1 - o.1) * b.height / Double(r.fh) / 2
    let x = Int32(scrollRest.0.rounded(.towardZero)), y = Int32(scrollRest.1.rounded(.towardZero))
    if x == 0 && y == 0 { return }
    scrollRest.0 -= Double(x); scrollRest.1 -= Double(y)
    CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: y, wheel2: x, wheel3: 0)?.post(tap: .cghidEventTap)
    lock.lock(); lastKey = now(); lastScroll = lastKey; lock.unlock()
}
if !selftest { Thread {
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
        else if m[0] == 6 { let dx = i(4), dy = i(8); DispatchQueue.main.async { scroll(dx, dy) } }
        else if m[0] == 7 { lock.lock(); quickOn.toggle(); quickDirty = true; lock.unlock(); ready.signal() }   // three fingers: the quick panel
        else if m[0] == 8 && m[1] < 3 { lock.lock(); panelStats[Int(m[1])] = (i(4), i(8), i(12)); lock.unlock() }   // the tablet's profile
        else if m[0] == 9 && control { print("light \(i(4))") }   // the tablet's frontlight, permille
    }
}.start() }
if !selftest && !AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) {
    print("the tablet's touches need the Accessibility permission (System Settings › Privacy & Security › Accessibility) for this terminal")
}

// --- the display
/** The virtual display's one mode, the asked one: given several, macOS picks its own and refuses CGDisplaySetDisplayMode on the others
 *  (error 1001). HiDPI: the mode is in points, drawn at twice that (Retina); without it, one point is one pixel. */
func applyMode() {
    let s = CGVirtualDisplaySettings(); s.hiDPI = native ? 0 : 1
    // 120 Hz: macOS composes the display twice as often, so a change waits half as long before the capture sees it
    s.modes = [CGVirtualDisplayMode(width: UInt(points.0), height: UInt(points.1), refreshRate: 120)]
    if virtualDisplay?.apply(s) == true { return }
    s.modes = [CGVirtualDisplayMode(width: UInt(points.0), height: UInt(points.1), refreshRate: 60)]
    if virtualDisplay?.apply(s) == false { die("the virtual display refused its mode") }
}
var virtualDisplay: CGVirtualDisplay?   // kept alive: the display goes away with the object
var target: CGDirectDisplayID
if selftest { target = CGMainDisplayID() } else if mirror >= 0 {
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
// dark areas (a dark mode's window: light letters on 30 to 50 grey): on the panel a field of ink with thin pale letters that the edges eat.
// Turned, they read as ink on paper. Per pixel, by a vote of the area around it (169 samples, every 8 pixels over 97 x 97): when most are
// dark (luma under 128) the pixel's luma is turned (255 - l) before the curve, so a dark panel turns at its own border and the light windows
// around it stay. Wider than a title's letters and a vote, not a mean: with 33 x 33 and a mean, the middle of a big bold title outvoted its
// dark field and stayed white (a dotted band across the letters). The same samples on the GPU (shade below): both paths agree to the pixel.
// --invert 0 keeps them, 2 turns the whole screen
// The same samples tell a picture from the interface (--dither 3, "pictures only"): when a quarter or more of them come out of the curve as
// a middle grey (as this pixel is turned or not), the area is a photo or a film and keeps its dither; else it is the interface (flat fields,
// letters, icons), cut to pure ink or paper at 128: no dots on it, sharper and fewer bytes
/** How the pixel at (x, y) is drawn: turned (a dark area), and whether its area is a picture. */
@inline(__always) func around(_ src: UnsafePointer<UInt8>, _ bpr: Int, _ fw: Int, _ fh: Int, _ x: Int, _ y: Int, _ t: UnsafePointer<UInt8>) -> (turn: Bool, picture: Bool) {
    var n = 0, mid = 0, midTurned = 0, dy = -48
    while dy <= 48 {
        let row = src + min(max(y + dy, 0), fh - 1) * bpr
        var dx = -48
        while dx <= 48 {
            let l = Int(row[min(max(x + dx, 0), fw - 1)])
            if l < 128 { n += 1 }
            let a = t[l], b = t[255 - l]
            if a > 8 && a < 247 { mid += 1 }
            if b > 8 && b < 247 { midTurned += 1 }
            dx += 8
        }
        dy += 8
    }
    let turn = invertMode == 2 || (invertMode == 1 && n > 84)
    return (turn, (turn ? midTurned : mid) >= 42)
}
var minBuf = [UInt8](repeating: 0, count: 0)
// and the edges: a pixel darker than the lightest of its 5x5 neighbours by more than 4 loses --edges (10) levels per level of difference, so
// a hairline of light grey on white (a window's border, a separator, 220 or 240 on 255) comes out black or dotted instead of white, and
// text gets a little bolder; the light side of an edge, and smooth gradients, keep the curve's value
var maxBuf = [UInt8](repeating: 255, count: 0)
/** A pixel's grey after the edges: `rise` is how much lighter its lightest neighbour is. A line found that way and darker than 200 is ink,
 *  not a grey: dithered it came out dotted (a button's border, a separator, a dark mode's faint borders once turned). The shader's twin */
@inline(__always) func line(_ v: Int, _ rise: Int) -> UInt8 {
    let e = rise - edgeFloor
    if e <= 0 { return UInt8(v) }
    let g = max(0, v - e * edges)
    return g < 200 ? 0 : UInt8(g)
}
/** The frame's luma over box b (frame pixels) -> grey, at its place on the panel. */
func shade(_ src: UnsafePointer<UInt8>, _ bpr: Int, _ fw: Int, _ fh: Int, _ b: (Int, Int, Int, Int)) {
    let bw = b.2 - b.0, bh = b.3 - b.1
    if maxBuf.count < bw * bh { maxBuf = [UInt8](repeating: 255, count: W * H) }
    grey.withUnsafeMutableBufferPointer { g in maxBuf.withUnsafeMutableBufferPointer { m in tone.withUnsafeBufferPointer { t in
        if minBuf.count < bw * bh && invertMode != 0 && edges > 0 { minBuf = [UInt8](repeating: 0, count: W * H) }
        if edges > 0 {
            var si = vImage_Buffer(data: UnsafeMutableRawPointer(mutating: src), height: vImagePixelCount(fh), width: vImagePixelCount(fw), rowBytes: bpr)
            var mo = vImage_Buffer(data: m.baseAddress!, height: vImagePixelCount(bh), width: vImagePixelCount(bw), rowBytes: bw)
            vImageMax_Planar8(&si, &mo, nil, vImagePixelCount(b.0), vImagePixelCount(b.1), 5, 5, vImage_Flags(kvImageEdgeExtend))
            if invertMode != 0 {   // a turned pixel's lightest neighbour is the darkest one before it turned
                minBuf.withUnsafeMutableBufferPointer { n in
                    var no = vImage_Buffer(data: n.baseAddress!, height: vImagePixelCount(bh), width: vImagePixelCount(bw), rowBytes: bw)
                    vImageMin_Planar8(&si, &no, nil, vImagePixelCount(b.0), vImagePixelCount(b.1), 5, 5, vImage_Flags(kvImageEdgeExtend))
                }
            }
        }
        let step = rotate == 90 ? W : rotate == 270 ? -W : rotate == 180 ? -1 : 1   // the next frame pixel of a row, on the panel
        minBuf.withUnsafeBufferPointer { n in
        for y in 0..<bh {
            let (px, py) = toPanel(b.0, b.1 + y)
            let s = src + (b.1 + y) * bpr + b.0, d = g.baseAddress! + py * W + px, mx = m.baseAddress! + y * bw
            if invertMode == 0 && ditherKind != 3 {
                if edges == 0 { for x in 0..<bw { d[x * step] = t[Int(s[x])] }; continue }
                for x in 0..<bw { let v = Int(s[x]); d[x * step] = line(Int(t[v]), Int(mx[x]) - v) }
                continue
            }
            let mn = edges > 0 && invertMode != 0 ? n.baseAddress! + y * bw : nil
            for x in 0..<bw {
                let (turn, picture) = around(src, bpr, fw, fh, b.0 + x, b.1 + y, t.baseAddress!)
                let v = turn ? 255 - Int(s[x]) : Int(s[x])
                var o = Int(t[v])
                if edges > 0 { o = Int(line(o, (turn ? 255 - Int(mn![x]) : Int(mx[x])) - v)) }
                if ditherKind == 3 && !picture { o = o < 128 ? 0 : 255 }
                d[x * step] = UInt8(o)
            }
        }
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
/** A 64x64 blue-noise threshold map (void and cluster, Ulichney 1993): no cross-hatch, the dots spread evenly. */
let blueNoise: [UInt8] = {
    let n = 64, N = n * n, sigma = 1.5
    var on = [Bool](repeating: false, count: N), energy = [Double](repeating: 0, count: N), rank = [Int](repeating: 0, count: N)
    var kernel = [[Double]](repeating: [Double](repeating: 0, count: 2 * 6 + 1), count: 2 * 6 + 1)
    for dy in -6...6 { for dx in -6...6 { kernel[dy + 6][dx + 6] = exp(-Double(dx * dx + dy * dy) / (2 * sigma * sigma)) } }
    func splat(_ i: Int, _ sign: Double) {
        let x = i % n, y = i / n
        for dy in -6...6 { for dx in -6...6 { energy[((y + dy + n) % n) * n + (x + dx + n) % n] += sign * kernel[dy + 6][dx + 6] } }
    }
    var seed: UInt64 = 0x9e3779b97f4a7c15
    func rnd() -> Int { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; return Int(seed % UInt64(N)) }
    var ones = 0
    while ones < N / 10 { let i = rnd(); if !on[i] { on[i] = true; splat(i, 1); ones += 1 } }
    while true {   // the tightest cluster to the largest void, until they are the same point
        var c = -1, v = -1
        for i in 0..<N where on[i] && (c < 0 || energy[i] > energy[c]) { c = i }
        on[c] = false; splat(c, -1)   // the void is looked for once the dot is out: it may be its own place, and then it is done
        for i in 0..<N where !on[i] && (v < 0 || energy[i] < energy[v]) { v = i }
        if v == c { on[c] = true; splat(c, 1); break }
        on[v] = true; splat(v, 1)
    }
    let start = on
    var k = ones
    while k > 0 {   // the initial dots ranked from the most clustered down
        var c = -1
        for i in 0..<N where on[i] && (c < 0 || energy[i] > energy[c]) { c = i }
        on[c] = false; splat(c, -1); k -= 1; rank[c] = k
    }
    on = start; energy = [Double](repeating: 0, count: N); for i in 0..<N where on[i] { splat(i, 1) }
    k = ones
    while k < N {   // then the voids filled, largest first
        var v = -1
        for i in 0..<N where !on[i] && (v < 0 || energy[i] < energy[v]) { v = i }
        on[v] = true; splat(v, 1); rank[v] = k; k += 1
    }
    return rank.map { UInt8($0 * 256 / N) }
}()
/** The threshold map, 64x64: one level (threshold), Bayer 8x8 tiled, or blue noise. */
func makeThr() -> [UInt8] {
    switch ditherKind {
    case 0: return [UInt8](repeating: 128, count: 64 * 64)
    case 1: return (0..<64 * 64).map { UInt8(Int(bayer[($0 / 64 & 7) * 8 + ($0 & 7)]) * 4 + 2) }
    default: return blueNoise.map { max(1, $0) }   // 0 is always ink, 255 always paper ("pictures only" cuts the interface to them)
    }
}
var thr = makeThr()
var stats = (frames: 0, rects: 0, bytes: 0, dither: 0.0, wait: 0.0, copies: 0, t: now())
// the profile, every 2 s: how old a frame is when ScreenCaptureKit gives it, a pointer move to the tablet's answer, the clean passes
var prof = (age: [Double](), pointer: [Double](), clean: [Double]())
func spread(_ v: [Double]) -> String {
    guard !v.isEmpty else { return "-" }
    let s = v.sorted()
    return String(format: "%.0f/%.0f ms", s[s.count / 2], s.last!)
}

/** shown -> cur, 1 bit, over rows y0..<y1 and the bytes holding x0..<x1. */
func dither(_ x0: Int, _ y0: Int, _ x1: Int, _ y1: Int) {
    let b0 = x0 / 8, b1 = (x1 + 7) / 8
    cur.withUnsafeMutableBufferPointer { c in thr.withUnsafeBufferPointer { t in shown.withUnsafeBufferPointer { g in
        for y in y0..<y1 {
            let row = g.baseAddress! + y * W, out = c.baseAddress! + y * stride, tr = t.baseAddress! + (y & 63) * 64
            for bx in b0..<b1 {
                let x = bx * 8
                var b: UInt8 = 0
                for i in 0..<min(8, W - x) where row[x + i] < tr[(x + i) & 63] { b |= 0x80 >> UInt8(i) }
                out[bx] = b
            }
        }
    } } }
}

/** cur's rows over (x, y, w, h), x a multiple of 8. */
func bitsOf(_ x: Int, _ y: Int, _ w: Int, _ h: Int) -> [UInt8] {
    let rs = (w + 7) / 8
    var bits = [UInt8](repeating: 0, count: rs * h)
    for j in 0..<h { let o = (y + j) * stride + x / 8; bits.replaceSubrange(j * rs..<(j + 1) * rs, with: cur[o..<(o + rs)]) }
    return bits
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
// typing: while keys come (the last one less than typingMs ago) nothing is cleaned and nothing flashes; once it stops, what the typing drew
// is cleaned at once, there only (a partial flash of the lines typed). framesHz: screen frames sent per second at most (the newest)
var typingMs = 800, framesHz = 60, blinkFilter = true
var lastKey = -1e9   // main thread writes, the sender reads under lock
// the mouse: moves, clicks and drags (the Mac's, or a finger and the Marker on the tablet) hold the cleaning until they rest mouseMs
var mouseMs = 500, lastMouse = -1e9
var typedTiles = [Bool](repeating: false, count: tilesX * tilesY)
// a blinking caret: a tile that only goes back to the picture it had before the last one sent, by a thin column of pixels, keeps the darker
// of the two on the tablet (the caret shown) instead of flipping, ghosting a little more at each blink
var sentHash = [UInt64](repeating: 0, count: tilesX * tilesY), beforeHash = sentHash
func tileHash(_ t: Int, _ cur: [UInt8] = cur) -> UInt64 {
    let tx = t % tilesX, ty = t / tilesX
    var h: UInt64 = 0xcbf29ce484222325
    for y in (ty * TH)..<min(H, (ty + 1) * TH) { let o = y * stride; for i in (tx * TW / 8)..<min(stride, (tx + 1) * TW / 8) { h = (h ^ UInt64(cur[o + i])) &* 0x100000001b3 } }
    return h
}
/** The caret's blink back in tile t: the change from what the tablet shows is a column at most 6 px wide that loses ink. */
func blinkBack(_ t: Int) -> Bool {
    let tx = t % tilesX, ty = t / tilesX
    var lo = Int.max, hi = -1, gained = 0, lost = 0
    for y in (ty * TH)..<min(H, (ty + 1) * TH) { let o = y * stride; for i in (tx * TW / 8)..<min(stride, (tx + 1) * TW / 8) {
        let d = cur[o + i] ^ prev[o + i]
        if d == 0 { continue }
        for b in 0..<8 where d & (0x80 >> UInt8(b)) != 0 { lo = min(lo, i * 8 + b); hi = max(hi, i * 8 + b) }
        gained += (d & cur[o + i]).nonzeroBitCount; lost += (d & prev[o + i]).nonzeroBitCount
    } }
    return hi >= 0 && hi - lo < 6 && gained == 0 && lost > 0
}
var backToFast = 0.0   // when the clean pass's waveform gives way to the fast one again
/** Cleans the tiles of mask. fast: the pointer's trail, all in the fast waveform (no waveform switch: the next move starts at once). */
func clean(_ mask: inout [Bool], fast: Bool = false) {
    let c0 = now(); defer { prof.clean.append(now() - c0) }
    let rects = rectsOf(mask)
    mask = [Bool](repeating: false, count: tilesX * tilesY)
    if rects.isEmpty { return }
    func greys(_ x: Int, _ y: Int, _ w: Int, _ h: Int, more: Bool = false) {
        var payload = [UInt8](repeating: 0, count: w * h)
        for j in 0..<h { let o = (y + j) * W + x; payload.replaceSubrange(j * w..<(j + 1) * w, with: shown[o..<(o + w)]) }
        sendRect(x, y, w, h, payload, depth: 8, more: more)
    }
    if !fast && rects.reduce(0, { $0 + $1.2 * $1.3 }) * 3 >= W * H {   // much of the screen: one full refresh is one flash, and cleaner
        for (k, (x, y, w, h)) in rects.enumerated() { greys(x, y, w, h, more: k < rects.count - 1) }
        for _ in rects { acks.wait() }
        writeFull(header(3, 0, 0, 0, 0, 0), 16); cleaned = 0
        for i in 0..<dirty.count { dirty[i] = 0 }
        return
    }
    // a partial update drives only the pixels whose value changes, and a trail's are white already: the pixels drawn fast go black first,
    // in the fast waveform, so that they move again (the local flash of xochitl's eraser, on the strokes only), then the real content
    if !fastMode { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }
    if gentle {   // every pixel turned over once, half of them at a time (a grey checker, PineNote's complementary pass): no black flash
        for phase in 0..<2 {
            for (n, (x, y, w, h)) in rects.enumerated() {
                let rs = (w + 7) / 8
                var bits = [UInt8](repeating: 0, count: rs * h)
                for j in 0..<h { let o = (y + j) * stride + x / 8, k: UInt8 = (y + j + phase) & 1 == 0 ? 0xAA : 0x55
                    for i in 0..<rs { bits[j * rs + i] = cur[o + i] ^ k; dirty[o + i] = 0 } }
                sendRect(x, y, w, h, bits, more: n < rects.count - 1)
            }
            for _ in rects { acks.wait() }
        }
    } else {
        for (n, (x, y, w, h)) in rects.enumerated() {
            let rs = (w + 7) / 8
            var black = [UInt8](repeating: 0, count: rs * h)
            for j in 0..<h { let o = (y + j) * stride + x / 8; for i in 0..<rs { black[j * rs + i] = cur[o + i] | dirty[o + i]; dirty[o + i] = 0 } }
            sendRect(x, y, w, h, black, more: n < rects.count - 1)
        }
        for _ in rects { acks.wait() }
    }
    // and back in black and white, still fast: twice driven, the trail goes. A waveform switch costs more than it gives: xochitl repaints
    // the whole window in the new waveform (the panel driven ~1.3 s, measured 2026-10-28), and a move then waits behind it
    if fast || cleanMode == 0 {
        for (n, (x, y, w, h)) in rects.enumerated() { sendRect(x, y, w, h, bitsOf(x, y, w, h), more: n < rects.count - 1) }
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
// The pointer as macOS shows it (arrow, I-beam, hand), from Kenney's Cursor Pack (CC0, cursors/LICENSE-kenney.txt): its black outline and
// white inside, at --cursor pixels tall. Mask: 2 black, 1 white, 0 outside; (tx, ty) the hot spot
var pointerKind = 0, pendingKind = -1   // 0 arrow, 1 I-beam, 2 hand: macOS's current cursor (the main thread looks, the sender switches)
let cursorDir = Bundle.main.url(forResource: "cursors", withExtension: nil) ?? URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("cursors")
func loadCursor(_ name: String) -> (w: Int, h: Int, m: [UInt8], tx: Int, ty: Int)? {
    guard let img = NSImage(contentsOf: cursorDir.appendingPathComponent(name + ".png")), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    let sw = cg.width, sh = cg.height
    var px = [UInt8](repeating: 0, count: sw * sh * 4)
    guard let ctx = CGContext(data: &px, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: sw, height: sh))
    var x0 = sw, y0 = sh, x1 = -1, y1 = -1
    for y in 0..<sh { for x in 0..<sw where px[(y * sw + x) * 4 + 3] >= 128 { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y) } }
    if x1 < 0 { return nil }
    let k = Double(y1 - y0 + 1) / Double(max(cursorPx, 19)), w = Int((Double(x1 - x0 + 1) / k).rounded(.up)), h = max(cursorPx, 19)
    var m = [UInt8](repeating: 0, count: w * h)
    for y in 0..<h { for x in 0..<w {   // the source block under each pixel, averaged: covered at least half, dark at least half
        var a = 0, dark = 0, n = 0
        for sy in (y0 + Int(Double(y) * k))..<min(y1 + 1, y0 + max(Int(Double(y) * k) + 1, Int(Double(y + 1) * k))) {
            for sx in (x0 + Int(Double(x) * k))..<min(x1 + 1, x0 + max(Int(Double(x) * k) + 1, Int(Double(x + 1) * k))) {
                let o = (sy * sw + sx) * 4; n += 1
                if px[o + 3] >= 128 { a += 1; if Int(px[o]) + Int(px[o + 1]) + Int(px[o + 2]) < 384 { dark += 1 } }
            }
        }
        if n > 0 && a * 2 >= n { m[y * w + x] = dark * 2 >= a ? 2 : 1 }
    } }
    switch name {   // the hot spot: the arrow's tip, the I-beam's middle, the finger's tip
    case "ibeam": return (w, h, m, w / 2, h / 2)
    case "hand": var tx = w / 2; for x in 0..<w where m[x] != 0 { tx = x; break }; var e = tx; while e + 1 < w && m[e + 1] != 0 { e += 1 }; return (w, h, m, (tx + e) / 2, 0)
    default: return (w, h, m, 0, 0)
    }
}
// the vector arrow when the pack is missing: 2 black (its outline), 1 white (inside, and its edge outside), 0 outside; tip at (edge, edge)
func makeArrow() -> (w: Int, h: Int, m: [UInt8], tx: Int, ty: Int) {
    if let c = loadCursor(["arrow", "ibeam", "hand"][pointerKind]) { return c }
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
    return (w, h, out, e, e)
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
    let tip = at(u.tx, u.ty)
    return (w, h, m, tip.0, tip.1)
}
var pointerMask = turnedMask(), dotMask = makeDot()
// the tablet draws the pointer itself (+ptr): a move is 16 bytes and one small update there, no picture from here
let tabletPointer = caps.contains("ptr") && cursorPx > 0
var sentShape = ""   // the shape the tablet has: sent again when it changes
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
var pointerMoved = false, pointerAt = 0.0   // when the oldest move not yet on the tablet happened
var latestAge = 0.0
let pointerTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
pointerTimer.schedule(deadline: .now(), repeating: .milliseconds(8))
pointerTimer.setEventHandler {
    let p = pointerNow()
    lock.lock()
    if p?.x != pointer?.x || p?.y != pointer?.y { pointer = p; pointerMoved = true; if pointerAt == 0 { pointerAt = now() }; lock.unlock(); ready.signal() } else { lock.unlock() }
}
pointerTimer.resume()
/** macOS's cursor now, as one of the pack's three (by its image size and hot spot). */
func cursorKind() -> Int {
    guard let c = NSCursor.currentSystem else { return 0 }
    func same(_ o: NSCursor) -> Bool { o.image.size == c.image.size && o.hotSpot == c.hotSpot }
    return same(.iBeam) || same(.iBeamCursorForVerticalLayout) ? 1 : same(.pointingHand) ? 2 : 0
}
let kindTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
kindTimer.schedule(deadline: .now(), repeating: .milliseconds(100))
kindTimer.setEventHandler {
    if penNear && now() > penLeaveAt { proximity(false) }
    let k = cursorPx > 0 ? cursorKind() : 0
    lock.lock(); if k != pointerKind && k != pendingKind { pendingKind = k; lock.unlock(); ready.signal() } else { lock.unlock() }
}
kindTimer.resume()

// --- live settings: the window (below) sets them, the sender takes them between two frames
/** The settings as the command line left them. */
func currentTune() -> Tune {
    Tune(black: Double(levels.0), white: Double(levels.1), gamma: gamma, edges: Double(edges), edgeFloor: Double(edgeFloor), dither: ditherKind,
         cursor: Double(cursorPx), moving: moving, dot: Double(dotPx), pointerHz: Double(pointerHz), trail: Double(trailMs),
         fastMode: fastMode0, idle: Double(idleMs), minClean: minClean < 0 ? 1.0 : Double(minClean) * 100 / Double(W * H), greys: cleanMode != 0,
         typing: Double(typingMs), framesHz: Double(framesHz), blink: blinkFilter, hold: holdOn, holdPen: Double(holdPen), holdColour: Double(holdColour),
         holdFull: Double(holdFull), mouse: Double(mouseMs), gentle: gentle, tabletPen: tabletPen, rotationLock: rotationLock, invert: invertMode)
}
var pendingTune: Tune?, pendingAction = ""   // "full", "clean" or "quit-tablet"
var reshade = false   // the tone changed: the whole frame goes through it again
func apply(_ t: Tune) {
    let shader = Int(t.black) != levels.0 || Int(t.white) != levels.1 || t.gamma != gamma || Int(t.edges) != edges || Int(t.edgeFloor) != edgeFloor || t.dither != ditherKind || t.invert != invertMode
    let look = Int(t.cursor) != cursorPx || Int(t.dot) != dotPx
    levels = (Int(t.black), max(Int(t.black) + 1, Int(t.white))); gamma = t.gamma; edges = Int(t.edges); edgeFloor = Int(t.edgeFloor); ditherKind = t.dither; invertMode = t.invert
    if cursorPx > 0 { cursorPx = Int(t.cursor) }
    moving = t.moving; dotPx = Int(t.dot); pointerHz = max(1, Int(t.pointerHz)); trailMs = Int(t.trail)
    idleMs = Int(t.idle); minClean = Int(t.minClean * Double(W * H) / 100); cleanMode = t.greys ? 3 : 0
    typingMs = Int(t.typing); framesHz = max(1, Int(t.framesHz)); blinkFilter = t.blink; mouseMs = Int(t.mouse)
    holdOn = t.hold; holdPen = Int(t.holdPen); holdColour = Int(t.holdColour); holdFull = Int(t.holdFull)
    gentle = t.gentle; tabletPen = t.tabletPen; rotationLock = t.rotationLock
    if t.fastMode != fastMode0 { fastMode0 = t.fastMode; writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }
    if shader { tone = makeTone(); thr = makeThr() }
    if look { uprightMask = makeArrow(); pointerMask = turnedMask(); dotMask = makeDot() }
    if shader || look { reshade = true }
    lock.lock(); liveTune = t; quickDirty = quickOn; lock.unlock()
}
var liveTune = Tune()   // what the engine runs now (the quick panel reads it on the main thread)

// --- the quick panel: three fingers on the tablet show it over the picture, upright, at the top; its buttons act at once
var quickOn = false, quickDirty = false   // asked (reader and main threads), redrawn (the sender)
var quickShown = false, quickPixels = [UInt8](), quickRect = (x: 0, y: 0, w: 0, h: 0)   // the sender's: the panel as drawn, frame pixels
let quickButtons = ["Clean", "Full", "preset", "Contrast −", "Contrast +", "rotation", "Close"]
func quickPlace() -> (x: Int, y: Int, w: Int, h: Int) {
    let w = min(region.fw - 40, 1260), h = 130
    return ((region.fw - w) / 2, 30, w, h)
}
func presetName(_ t: Tune) -> String {
    for p in presets { var a = p.tune, b = t; a.tabletPen = false; b.tabletPen = false; a.rotationLock = false; b.rotationLock = false; a.cursor = 0; b.cursor = 0
        if a == b { return p.title } }
    return "Custom"
}
/** The panel in grey levels, upright: white, a black frame, one cell per button. */
func renderQuick() {
    let q = quickPlace(); quickRect = q
    var px = [UInt8](repeating: 255, count: q.w * q.h)
    guard let ctx = CGContext(data: &px, width: q.w, height: q.h, bitsPerComponent: 8, bytesPerRow: q.w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: 0) else { return }
    lock.lock(); let t = liveTune; lock.unlock()
    ctx.setFillColor(gray: 0, alpha: 1); ctx.setStrokeColor(gray: 0, alpha: 1)
    ctx.setLineWidth(5); ctx.stroke(CGRect(x: 3, y: 3, width: q.w - 6, height: q.h - 6))
    let cell = Double(q.w) / Double(quickButtons.count)
    for (i, name) in quickButtons.enumerated() {
        if i > 0 { ctx.fill(CGRect(x: Double(i) * cell - 1.5, y: 18, width: 3, height: Double(q.h - 36))) }
        let label = name == "preset" ? "▸ " + presetName(t) : name == "rotation" ? (t.rotationLock ? "Unlock turn" : "Lock turn") : name
        let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 30, nil)
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: label, attributes: [.font: font, .foregroundColor: CGColor(gray: 0, alpha: 1)]))
        let width = CTLineGetTypographicBounds(line, nil, nil, nil)
        ctx.textPosition = CGPoint(x: Double(i) * cell + (cell - width) / 2, y: Double(q.h) / 2 - 10)
        CTLineDraw(line, ctx)
    }
    quickPixels = px.map { $0 < 128 ? 0 : 255 }
}
/** A tap on the tablet (frame pixels): true when the panel took it. */
func quickTap(_ f: (Int, Int)) -> Bool {
    lock.lock(); let on = quickOn, t = liveTune; lock.unlock()
    let q = quickPlace()
    guard on, f.0 >= q.x, f.0 < q.x + q.w, f.1 >= q.y, f.1 < q.y + q.h else { return false }
    touchId = -3   // the rest of this touch is the panel's
    var n = t
    switch quickButtons[(f.0 - q.x) * quickButtons.count / q.w] {
    case "Clean": lock.lock(); pendingAction = "clean"; lock.unlock()
    case "Full": lock.lock(); pendingAction = "full"; lock.unlock()
    case "preset":
        let i = ((presets.firstIndex { $0.title == presetName(t) } ?? -1) + 1) % presets.count
        n = presets[i].tune; n.tabletPen = t.tabletPen; n.rotationLock = t.rotationLock; n.cursor = t.cursor
    case "Contrast −": n.black = max(0, t.black - 15); n.white = min(255, t.white + 15)
    case "Contrast +": n.black = min(t.white - 40, t.black + 15); n.white = max(n.black + 40, t.white - 15)
    case "rotation": n.rotationLock.toggle()
    default: lock.lock(); quickOn = false; quickDirty = true; lock.unlock()
    }
    lock.lock(); if n != t { pendingTune = n; announce = true }; quickDirty = true; lock.unlock(); ready.signal()
    return true
}
var announce = false   // the panel changed the settings: the menu bar app is told (a "tune" line)

var cursorArea = CGRect.null   // frame pixels: where macOS's pointer has been since the last frame taken
func addCursor(_ p: (x: Int, y: Int)) {
    let b = mapBox(pointerBox(p), toFrame)
    cursorArea = cursorArea.union(CGRect(x: b.0, y: b.1, width: b.2 - b.0, height: b.3 - b.1))
}
// --- the GPU: a large change (a scroll, a new window, a turn) goes through the tone curve, the edges and the dither in one Metal pass,
// read straight from the capture's surface: the CPU then only copies the result. Small changes stay on the CPU (a dispatch costs more)
let gpuFrom = 150_000   // frame pixels from which a change goes to the GPU
let shaderSource = """
#include <metal_stdlib>
using namespace metal;
// p: W H stride ox oy fw fh rotate bx0 by0 bx1 by1 edges edgeFloor invert dither; one thread per byte of output (8 panel pixels) of the box
kernel void shade(texture2d<float, access::read> src [[texture(0)]], constant int* p [[buffer(0)]], constant uchar* tone [[buffer(1)]],
                  constant uchar* thr [[buffer(2)]], device uchar* grey [[buffer(3)]], device uchar* bits [[buffer(4)]], uint2 g [[thread_position_in_grid]]) {
  const int W = p[0], stride = p[2], ox = p[3], oy = p[4], fw = p[5], fh = p[6], rot = p[7], edges = p[12], floor_ = p[13];
  const int bx = p[8] + int(g.x), py = p[9] + int(g.y);
  if (bx >= p[10] || py >= p[11]) return;
  uchar out = 0;
  for (int i = 0; i < 8; i++) {
    const int px = bx * 8 + i;
    if (px >= W) break;
    const int x = px - ox, y = py - oy;
    int fx = x, fy = y;   // toFrame
    if (rot == 90) { fx = y; fy = fh - 1 - x; } else if (rot == 180) { fx = fw - 1 - x; fy = fh - 1 - y; } else if (rot == 270) { fx = fw - 1 - y; fy = x; }
    int v = 255;   // outside the frame: the white band
    if (fx >= 0 && fy >= 0 && fx < fw && fy < fh) {
      int l = int(round(src.read(uint2(fx, fy)).r * 255.0));
      bool turn = p[14] == 2, picture = true;   // around() on the CPU: the same 169 samples
      if (p[14] == 1 || p[15] == 3) {
        int n = 0, mid = 0, midTurned = 0;
        for (int dy = -48; dy <= 48; dy += 8) for (int dx = -48; dx <= 48; dx += 8) {
          const int k = int(round(src.read(uint2(clamp(fx + dx, 0, fw - 1), clamp(fy + dy, 0, fh - 1))).r * 255.0));
          n += k < 128 ? 1 : 0;
          const int a = tone[k], b = tone[255 - k];
          mid += a > 8 && a < 247 ? 1 : 0; midTurned += b > 8 && b < 247 ? 1 : 0;
        }
        turn = p[14] == 2 || (p[14] == 1 && n > 84);
        picture = (turn ? midTurned : mid) >= 42;
      }
      if (turn) l = 255 - l;
      v = tone[l];
      if (edges > 0) {
        int m = 0, n = 255;
        for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
          const int k = int(round(src.read(uint2(clamp(fx + dx, 0, fw - 1), clamp(fy + dy, 0, fh - 1))).r * 255.0));
          m = max(m, k); n = min(n, k);
        }
        const int e = (turn ? 255 - n : m) - l - floor_;
        if (e > 0) { v = max(0, v - e * edges); if (v < 200) v = 0; }   // line() on the CPU: a line is ink, never dotted
      }
      if (p[15] == 3 && !picture) v = v < 128 ? 0 : 255;
      grey[py * W + px] = uchar(v);
    }
    if (v < int(thr[(py & 63) * 64 + (px & 63)])) out |= uchar(0x80 >> i);
  }
  bits[py * stride + bx] = out;
}
"""
final class GPU {
    let q: MTLCommandQueue, pipe: MTLComputePipelineState, cache: CVMetalTextureCache
    let greyB: MTLBuffer, bitsB: MTLBuffer, toneB: MTLBuffer, thrB: MTLBuffer
    init?() {
        guard let dev = MTLCreateSystemDefaultDevice(), let q = dev.makeCommandQueue(),
              let lib = try? dev.makeLibrary(source: shaderSource, options: nil), let f = lib.makeFunction(name: "shade"),
              let pipe = try? dev.makeComputePipelineState(function: f) else { return nil }
        var c: CVMetalTextureCache?
        guard CVMetalTextureCacheCreate(nil, nil, dev, nil, &c) == kCVReturnSuccess, let cache = c,
              let g = dev.makeBuffer(length: W * H, options: .storageModeShared), let b = dev.makeBuffer(length: stride * H, options: .storageModeShared),
              let t = dev.makeBuffer(length: 256, options: .storageModeShared), let r = dev.makeBuffer(length: 4096, options: .storageModeShared) else { return nil }
        (self.q, self.pipe, self.cache, greyB, bitsB, toneB, thrB) = (q, pipe, cache, g, b, t, r)
    }
    /** The panel box b (pixels) from the frame pb (fw x fh, its luma plane): greys and bits into the buffers; false when it cannot. */
    func run(_ pb: CVPixelBuffer, _ fw: Int, _ fh: Int, _ b: (Int, Int, Int, Int)) -> Bool {
        var tex: CVMetalTexture?
        guard CVMetalTextureCacheCreateTextureFromImage(nil, cache, pb, nil, .r8Unorm, CVPixelBufferGetWidthOfPlane(pb, 0), CVPixelBufferGetHeightOfPlane(pb, 0), 0, &tex) == kCVReturnSuccess,
              let tx = tex, let t = CVMetalTextureGetTexture(tx), let cb = q.makeCommandBuffer(), let e = cb.makeComputeCommandEncoder() else { return false }
        tone.withUnsafeBytes { toneB.contents().copyMemory(from: $0.baseAddress!, byteCount: 256) }
        thr.withUnsafeBytes { thrB.contents().copyMemory(from: $0.baseAddress!, byteCount: 4096) }
        let r = region
        var p: [Int32] = [W, H, stride, r.ox, r.oy, fw, fh, rotate, b.0 / 8, b.1, (b.2 + 7) / 8, b.3, edges, edgeFloor, invertMode, ditherKind].map { Int32($0) }
        e.setComputePipelineState(pipe); e.setTexture(t, index: 0)
        e.setBytes(&p, length: p.count * 4, index: 0); e.setBuffer(toneB, offset: 0, index: 1); e.setBuffer(thrB, offset: 0, index: 2)
        e.setBuffer(greyB, offset: 0, index: 3); e.setBuffer(bitsB, offset: 0, index: 4)
        e.dispatchThreads(MTLSize(width: (b.2 + 7) / 8 - b.0 / 8, height: b.3 - b.1, depth: 1), threadsPerThreadgroup: MTLSize(width: 8, height: 8, depth: 1))
        e.endEncoding(); cb.commit(); cb.waitUntilCompleted()
        return cb.status == .completed
    }
    /** Its result over box b into grey, shown and cur. */
    func take(_ b: (Int, Int, Int, Int)) {
        let g = greyB.contents().assumingMemoryBound(to: UInt8.self), bits = bitsB.contents().assumingMemoryBound(to: UInt8.self)
        let b0 = b.0 / 8, b1 = (b.2 + 7) / 8
        grey.withUnsafeMutableBufferPointer { gr in shown.withUnsafeMutableBufferPointer { sh in cur.withUnsafeMutableBufferPointer { c in
            for y in b.1..<b.3 {
                let o = y * W + b.0
                (gr.baseAddress! + o).update(from: g + o, count: b.2 - b.0); (sh.baseAddress! + o).update(from: g + o, count: b.2 - b.0)
                (c.baseAddress! + y * stride + b0).update(from: bits + y * stride + b0, count: b1 - b0)
            }
        } } }
    }
}
let gpu = GPU()

// --- a scroll: the tablet moves what it shows (COPY, +copy) and gets only what is new, instead of the whole moved area again
var lastScroll = -1e9   // main thread writes, the sender reads under lock
/** The move (dx, dy) on the panel, one of them 0, that turns most lines of prev into cur's over box b: lines (rows, or columns when the
 *  tablet is sideways to the page) are matched by hash and each match votes for its distance; nil when no distance wins clearly. */
func findShift(_ b: (Int, Int, Int, Int)) -> (Int, Int)? {
    let b0 = b.0 / 8, b1 = (b.2 + 7) / 8
    var rc = [UInt64](), rp = [UInt64](), cc = [UInt64](), cp = [UInt64]()
    cur.withUnsafeBufferPointer { c in prev.withUnsafeBufferPointer { p in
        for y in b.1..<b.3 {
            var h1: UInt64 = 0xcbf29ce484222325, h2 = h1; let o = y * stride
            for i in b0..<b1 { h1 = (h1 ^ UInt64(c[o + i])) &* 0x100000001b3; h2 = (h2 ^ UInt64(p[o + i])) &* 0x100000001b3 }
            rc.append(h1); rp.append(h2)
        }
        for x in b.0..<b.2 {
            var h1: UInt64 = 0xcbf29ce484222325, h2 = h1; let i = x >> 3, sh = UInt8(7 - (x & 7))
            for y in b.1..<b.3 { let o = y * stride + i; h1 = (h1 ^ UInt64((c[o] >> sh) & 1)) &* 0x100000001b3; h2 = (h2 ^ UInt64((p[o] >> sh) & 1)) &* 0x100000001b3 }
            cc.append(h1); cp.append(h2)
        }
    } }
    func blank(_ n: Int) -> UInt64 { var h: UInt64 = 0xcbf29ce484222325; for _ in 0..<n { h = h &* 0x100000001b3 }; return h }   // all white
    func vote(_ a: [UInt64], _ p: [UInt64], _ white: UInt64) -> (Int, Int) {
        var at = [UInt64: [Int]]()
        for (i, h) in p.enumerated() where h != white { at[h, default: []].append(i) }
        var votes = [Int: Int](), lines = 0
        for (i, h) in a.enumerated() where h != white { lines += 1; for j in (at[h] ?? []).prefix(4) where j != i { votes[i - j, default: 0] += 1 } }
        guard let best = votes.max(by: { $0.value < $1.value }), best.value >= 16, best.value * 10 >= lines * 4 else { return (0, 0) }
        return (best.key, best.value)
    }
    let v = vote(rc, rp, blank(b1 - b0)), h = vote(cc, cp, blank(b.3 - b.1))
    if v.1 == 0 && h.1 == 0 { return nil }
    return v.1 >= h.1 ? (0, v.0) : (h.0, 0)
}
/** prev once the tablet moved box b's picture by (dx, dy), and the rectangle that moves; nil when it leaves too much to send anyway. */
func shifted(_ b: (Int, Int, Int, Int), _ dx: Int, _ dy: Int) -> (src: (Int, Int, Int, Int), pic: [UInt8])? {
    let b0 = b.0 / 8, b1 = (b.2 + 7) / 8
    var pic = prev, src = (0, 0, 0, 0)
    if dx == 0 {   // rows: whole bytes
        let x0 = b0 * 8, x1 = min(W, b1 * 8), y0 = dy > 0 ? b.1 : b.1 - dy, y1 = dy > 0 ? b.3 - dy : b.3
        if y1 <= y0 { return nil }
        src = (x0, y0, x1 - x0, y1 - y0)
        for y in y0..<y1 { let s = y * stride, d = (y + dy) * stride; pic.replaceSubrange((d + b0)..<(d + b1), with: prev[(s + b0)..<(s + b1)]) }
    } else {   // columns: bit by bit
        let x0 = dx > 0 ? b.0 : b.0 - dx, x1 = dx > 0 ? b.2 - dx : b.2
        if x1 <= x0 { return nil }
        src = (x0, b.1, x1 - x0, b.3 - b.1)
        prev.withUnsafeBufferPointer { p in pic.withUnsafeMutableBufferPointer { q in
            for y in b.1..<b.3 { let o = y * stride
                for x in x0..<x1 { let t = x + dx, m = UInt8(0x80) >> UInt8(t & 7)
                    if (p[o + (x >> 3)] << UInt8(x & 7)) & 0x80 != 0 { q[o + (t >> 3)] |= m } else { q[o + (t >> 3)] &= ~m } } }
        } }
    }
    var before = 0, after = 0
    for y in b.1..<b.3 { let o = y * stride; for i in b0..<b1 { if cur[o + i] != prev[o + i] { before += 1 }; if cur[o + i] != pic[o + i] { after += 1 } } }
    return after * 10 < before * 6 ? (src, pic) : nil
}

/** --selftest: the GPU's pass against the CPU's on made-up frames, every way up and with and without edges; exits 0 when they agree. */
func gpuSelftest() -> Never {
    guard let g = gpu else { print("selftest: no Metal device"); exit(1) }
    var bad = 0, cases = 0, tc = 0.0, tg = 0.0
    for (rot, k, e) in [(0, 1.0, 10), (90, 1.0, 10), (180, 1.0, 0), (270, 1.0, 10), (90, 0.75, 10), (0, 0.6, 0)] {
        rotate = rot; edges = e
        let (pw, ph) = rot == 90 || rot == 270 ? (H, W) : (W, H)   // the frame as the Mac sees it
        let fw = Int(Double(pw) * k), fh = Int(Double(ph) * k)
        let (qw, qh) = rot == 90 || rot == 270 ? (fh, fw) : (fw, fh)
        region = ((W - qw) / 2 / 8 * 8, (H - qh) / 2, fw, fh)
        var pbo: CVPixelBuffer?
        CVPixelBufferCreate(nil, fw, fh, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
                            [kCVPixelBufferIOSurfacePropertiesKey: [:], kCVPixelBufferMetalCompatibilityKey: true] as CFDictionary, &pbo)
        guard let pb = pbo else { print("selftest: no pixel buffer"); exit(1) }
        CVPixelBufferLockBaseAddress(pb, [])
        let bpr = CVPixelBufferGetBytesPerRowOfPlane(pb, 0), src = CVPixelBufferGetBaseAddressOfPlane(pb, 0)!.assumingMemoryBound(to: UInt8.self)
        var seed: UInt32 = 12345
        for y in 0..<fh { for x in 0..<fw {   // a gradient, noise, and hairlines
            seed = seed &* 1664525 &+ 1013904223
            src[y * bpr + x] = x % 97 == 0 || y % 61 == 0 ? 220 : UInt8(truncatingIfNeeded: (x * 255 / fw + Int(seed >> 28) * 9) & 255)
        } }
        for d in [(0, 0, fw, fh), (37, 51, fw - 13, fh - 29)] {
            cases += 1
            let b = mapBox(d, toPanel)
            var t0 = now()
            shade(src, bpr, fw, fh, d)
            for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
            dither(b.0, b.1, b.2, b.3)
            tc += now() - t0; t0 = now()
            guard g.run(pb, fw, fh, b) else { print("selftest: the GPU pass failed"); exit(1) }
            tg += now() - t0
            let gg = g.greyB.contents().assumingMemoryBound(to: UInt8.self), gb = g.bitsB.contents().assumingMemoryBound(to: UInt8.self)
            for y in b.1..<b.3 { for x in b.0..<b.2 {
                let o = y * stride + x / 8, m = UInt8(0x80) >> UInt8(x & 7)
                if gg[y * W + x] != grey[y * W + x] || (gb[o] & m) != (cur[o] & m) { bad += 1 }
            } }
        }
        CVPixelBufferUnlockBaseAddress(pb, [])
    }
    print(String(format: "selftest: %d cases, %d pixels differ; CPU %.1f ms, GPU %.1f ms per case", cases, bad, tc / Double(cases), tg / Double(cases)))
    // a scroll: a page of text-like bits moved down, then sideways (the tablet turned); the shift found, and the copy's result is cur
    var missed = 0
    for (dx, dy) in [(0, 37), (0, -12), (-23, 0), (40, 0)] {
        var seed: UInt32 = 99
        for i in 0..<prev.count { seed = seed &* 1664525 &+ 1013904223; prev[i] = (i / stride) % 9 < 3 ? UInt8(truncatingIfNeeded: seed >> 24) : 0 }
        cur = prev
        let b = (160, 200, 1400, 1800)
        for y in b.1..<b.3 { for x in b.0..<b.2 {
            let sx = x - dx, sy = y - dy, m = UInt8(0x80) >> UInt8(x & 7), o = y * stride + x / 8
            let on = sx >= b.0 && sx < b.2 && sy >= b.1 && sy < b.3 && (prev[sy * stride + sx / 8] << UInt8(sx & 7)) & 0x80 != 0
            if on { cur[o] |= m } else { cur[o] &= ~m }
        } }
        guard let f = findShift(b), f == (dx, dy), let m = shifted(b, f.0, f.1) else { print("selftest: scroll \(dx),\(dy) not found: \(String(describing: findShift(b)))"); missed += 1; continue }
        let s = m.src
        for y in (s.1 + dy)..<(s.1 + dy + s.3) { for x in (s.0 + dx)..<(s.0 + dx + s.2) {
            let o = y * stride + x / 8, k = UInt8(0x80) >> UInt8(x & 7)
            if (m.pic[o] & k) != (cur[o] & k) { missed += 1 } } }
    }
    print("selftest: scrolls, \(missed) wrong")
    // the codecs as the tablet decodes them (stream.h): zstd with Sub on greys, zstd on bits, lz4 on bits
    var wrong = 0
    let codecCases: [(UInt8, [String])] = [(8, ["zstd", "sub"]), (1, ["zstd"]), (1, ["lz4"])]
    for (depth, c) in codecCases {
        let w = 256, h = 64, count = depth == 8 ? w * h : w / 8 * h   // at least 1 KB: smaller goes plain
        var p = [UInt8](repeating: 0, count: count)
        for i in 0..<count { p[i] = i / 7 % 3 == 0 ? UInt8.random(in: 0...255) : UInt8(truncatingIfNeeded: i / 13) }
        guard let (codec, n) = squeeze(p, w, h, depth: depth, caps: Set(c)) else { wrong += 1; continue }
        var back = [UInt8](repeating: 0, count: p.count)
        let got: Int
        if codec & 0x7f == 2 { got = ZSTD_decompress(&back, back.count, zbuf, n) } else { got = compression_decode_buffer(&back, back.count, zbuf, n, nil, COMPRESSION_LZ4_RAW) }
        if codec & 0x80 != 0 { for j in 0..<h { for i in 1..<w { let k = j * w + i; back[k] = back[k] &+ back[k - 1] } } }
        if got != p.count || back != p { print("selftest: codec \(c) depth \(depth) does not come back"); wrong += 1 }
    }
    print("selftest: codecs, \(wrong) wrong")
    exit(bad == 0 && missed == 0 && wrong == 0 ? 0 : 1)
}
if selftest { gpuSelftest() }

Thread {
    var drawn: (x: Int, y: Int)? = nil, drawnDot = false   // where the pointer is drawn in shown, and as what
    var held: CVPixelBuffer?   // the last frame: a change of the shader goes through it again
    var lastFull = -1e9, resyncAt = -1.0   // the last full refresh seen, and when what changed during it goes again
    var lastPointer = 0.0, deferred = false   // when the pointer last went out; a move waits for its turn
    var lastFrame = 0.0   // when the last screen frame went out (framesHz)
    func any(_ m: [Bool]) -> Bool { m.contains(true) }
    while true {
        if deferred { _ = ready.wait(timeout: .now() + .milliseconds(5)) }
        else if resyncAt > 0 { _ = ready.wait(timeout: .now() + .milliseconds(20)) }
        else if now() - lastPointer < 400 { _ = ready.wait(timeout: .now() + .milliseconds(20)) }   // to draw the arrow once it stops
        else if (idleMs > 0 && any(fastTiles)) || any(trailTiles) || any(typedTiles) || !fastMode { _ = ready.wait(timeout: .now() + .milliseconds(30)) } else { ready.wait() }
        let tn = now()
        lock.lock(); let keyAt = lastKey, mouseAt = lastMouse; lock.unlock()
        let typing = typingMs > 0 && tn - keyAt < Double(typingMs)
        let handling = mouseMs > 0 && tn - mouseAt < Double(mouseMs)   // the mouse in use: nothing cleaned until it rests
        if !typing && !handling && any(typedTiles) {   // the typing stopped: the lines it drew, cleaned now, there only
            var t = typedTiles
            for i in 0..<t.count { typedTiles[i] = false; if t[i] { fastTiles[i] = false } }
            clean(&t)
        }
        if !fastMode && tn >= backToFast { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }   // ready before the next move
        lock.lock(); let tune = pendingTune, action = pendingAction, fa = fullAt; pendingTune = nil; pendingAction = ""; lock.unlock()
        // a full refresh repaints the panel for ~1.4 s: what changed meanwhile may not stay, so all of it goes again once it is over
        if fa != lastFull { lastFull = fa; fullSnapshot = cur; resyncAt = fa + 1600 }
        if resyncAt > 0 && now() >= resyncAt {
            resyncAt = -1
            let rects = rectsOf(changedSince([Bool](repeating: true, count: tilesX * tilesY)))
            for (n, (x, y, w, h)) in rects.enumerated() { sendRect(x, y, w, h, bitsOf(x, y, w, h), more: n < rects.count - 1) }
            for _ in rects { acks.wait() }
        }
        if let tune { apply(tune) }
        sched()
        lock.lock(); let kind = pendingKind; pendingKind = -1; lock.unlock()
        var stale: (Int, Int, Int, Int)? = nil   // the old pointer's box: back to the screen with the next picture
        lock.lock(); let qOn = quickOn, qDirty = quickDirty, tell = announce; quickDirty = false; announce = false; lock.unlock()
        if tell, control, let j = try? JSONEncoder().encode(liveTune) { print("tune " + String(decoding: j, as: UTF8.self)) }
        if kind >= 0 && kind != pointerKind {
            if let d = drawn, !tabletPointer { stale = pointerBox(d, dot: drawnDot) }
            pointerKind = kind; uprightMask = makeArrow(); pointerMask = turnedMask(); drawn = nil
        }
        if action == "quit-tablet" { writeFull(header(8, 0, 0, 0, 0, 0), 16); print("the tablet's app ends"); exit(0) }
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
        if idleMs > 0 && !typing && !handling && tn - lastMove >= 300 && tn - lastCheck >= 250 {
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
        if to >= 0 && to != rotate && !rotationLock {   // the tablet turned: the display and the capture take its shape, then a whole first frame
            let side = (to == 90 || to == 270) != (rotate == 90 || rotate == 270)
            rotate = to; firstFrame = true; firstFull = true; cursorArea = .null; pointerMask = turnedMask()
            if side { (FW, FH) = (FH, FW); if mirror < 0 { points = (points.1, points.0) } }
            print("the tablet turned: \(to)")
            if side { DispatchQueue.main.async { applyMode(); reconfigure() } }
        }
        lock.lock()
        if latest != nil && tn - lastFrame < 1000 / Double(framesHz) { lock.unlock(); deferred = true; continue }   // framesHz: the newest frame waits its turn
        var pb = latest, fd = frameDirty; latest = nil; frameDirty = .null; var moved = pointerMoved; pointerMoved = false; let p = pointer, movedAt = pointerAt, age = latestAge; lock.unlock()
        if pb != nil { lastFrame = tn }
        if pb != nil { prof.age.append(age) }
        if pb != nil { held = pb } else if reshade, let h = held { pb = h; fd = .infinite }
        if (invertMode == 1 || ditherKind == 3) && !fd.isNull && !fd.isInfinite { fd = fd.insetBy(dx: -48, dy: -48) }   // a change turns the pixels around it too, or makes them a picture (around)
        reshade = false
        // the pointer alone: at most --pointer-hz moves, the newest; updates that overlap on the panel wait for each other there
        if moved && pb == nil && now() - lastPointer < 1000 / Double(pointerHz) { lock.lock(); pointerMoved = true; lock.unlock(); moved = false; deferred = true; continue }
        deferred = false
        if moved { lastPointer = now() }
        // a moving pointer leaves a trail on e-ink whatever is done after: while it moves it is --pointer-moving (by default a dot, little
        // ink), and the arrow comes back sharp 120 ms after it stops
        let isMoving = cursorPx > 0 && now() - lastPointer < 120
        let q = isMoving && moving == 2 ? nil : p, qDot = isMoving && moving == 1
        if pb == nil && !moved && stale == nil && !qDirty && q?.x == drawn?.x && q?.y == drawn?.y && qDot == drawnDot { continue }
        let t0 = now()
        var box = (x0: W, y0: H, x1: 0, y1: 0)   // what to dither and compare
        var onGPU: (Int, Int, Int, Int)? = nil, onCPU: [(Int, Int, Int, Int)] = []   // dithered there already; still to dither here
        func grow(_ b: (Int, Int, Int, Int), cpu: Bool = true) { box = (min(box.x0, b.0), min(box.y0, b.1), max(box.x1, b.2), max(box.y1, b.3)); if cpu { onCPU.append(b) } }
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
                let b = mapBox(d, toPanel)
                if (d.2 - d.0) * (d.3 - d.1) >= gpuFrom, let g = gpu, g.run(pb, fw, fh, b) { g.take(b); onGPU = b; grow(b, cpu: false); gpuFrames += 1 }
                else {
                    shade(src, bpr, fw, fh, d)
                    for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
                    grow(b)
                }
            }
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        if let b = stale { for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }; grow(b) }
        if cursorPx > 0 && !tabletPointer, let d = drawn {   // our pointer: its old box back to the screen
            let b = pointerBox(d, dot: drawnDot)
            for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }
            grow(b)
        }
        if cursorPx == 0 && moved { if let d = drawn { addCursor(d) }; if let p { addCursor(p) } }
        if let d = drawn, d.x != q?.x || d.y != q?.y || drawnDot != qDot {   // where it was: its trail
            let b = pointerBox(d, dot: drawnDot)
            for ty in (b.1 / TH)..<min(tilesY, (b.3 + TH - 1) / TH) { for tx in (b.0 / TW)..<min(tilesX, (b.2 + TW - 1) / TW) { trailTiles[ty * tilesX + tx] = true; trailTime[ty * tilesX + tx] = now() } }
            // drawn by the tablet, its pixels are not in dirty: they are, for the clean's black pass to drive them again
            if tabletPointer { for y in b.1..<b.3 { let o = y * stride; for i in (b.0 / 8)..<min(stride, (b.2 + 7) / 8) { dirty[o + i] = 0xFF } } }
            lastMove = now()
        }
        let qBox = { let r = quickRect; return mapBox((r.x, r.y, r.x + r.w, r.y + r.h), toPanel) }
        if qDirty || qOn != quickShown {   // the panel shown, hidden or changed: its place from the screen first
            if quickShown { let b = qBox(); for y in b.1..<b.3 { let o = y * W; shown.replaceSubrange((o + b.0)..<(o + b.2), with: grey[(o + b.0)..<(o + b.2)]) }; grow(b) }
            quickShown = qOn
            if qOn { renderQuick() }
        }
        if quickShown {   // over what was drawn there, under the pointer
            let b = qBox()
            if qDirty || (box.x0 < b.2 && b.0 < box.x1 && box.y0 < b.3 && b.1 < box.y1) {
                let r = quickRect
                for y in 0..<r.h { for x in 0..<r.w { let p = toPanel(r.x + x, r.y + y); if p.0 >= 0 && p.0 < W && p.1 >= 0 && p.1 < H { shown[p.1 * W + p.0] = quickPixels[y * r.w + x] } } }
                grow(b)
            }
        }
        if tabletPointer && (q?.x != drawn?.x || q?.y != drawn?.y || qDot != drawnDot) {   // to the tablet, before the picture
            let pm = qDot ? dotMask : pointerMask, key = "\(qDot) \(pointerKind) \(rotate) \(cursorPx) \(dotPx)"
            if key != sentShape { sentShape = key; var hd = header(4, pm.tx, pm.ty, pm.w, pm.h, pm.m.count); hd[11] = 1; writeFull(hd, 16); writeFull(pm.m, pm.m.count) }
            writeFull(header(5, q?.x ?? 0, q?.y ?? 0, q == nil ? 0 : 1, 0, 0), 16)
        } else if cursorPx > 0 && !tabletPointer, let q { drawPointer(q, dot: qDot); grow(pointerBox(q, dot: qDot)) }
        drawn = q; drawnDot = qDot
        if pb == nil && cursorPx == 0 { continue }   // macOS draws the pointer: its move comes as a frame
        if onGPU == nil { if box.x1 > box.x0 && box.y1 > box.y0 { dither(box.x0, box.y0, box.x1, box.y1) } }
        else { for b in onCPU where b.2 > b.0 && b.3 > b.1 { dither(b.0, b.1, b.2, b.3) } }   // what was drawn over the GPU's part
        let t1 = now()
        // a scroll: the tablet moves what it shows, and gets only what is new
        lock.lock(); let scrolled = tn - lastScroll < 500; lock.unlock()
        var copy: [UInt8]? = nil
        if caps.contains("copy") && scrolled && pb != nil && !firstFrame && (box.x1 - box.x0) * (box.y1 - box.y0) >= W * H / 16,
           let sh = findShift((box.x0, box.y0, box.x1, box.y1)), let m = shifted((box.x0, box.y0, box.x1, box.y1), sh.0, sh.1) {
            let (dx, dy) = sh
            let b0 = box.x0 / 8, b1 = (box.x1 + 7) / 8
            for y in box.y0..<box.y1 { let o = y * stride; for i in b0..<b1 { dirty[o + i] |= prev[o + i] ^ m.pic[o + i] } }
            prev = m.pic
            let ts = now()
            for ty in (box.y0 / TH)..<min(tilesY, (box.y1 + TH - 1) / TH) { for tx in (b0 * 8 / TW)..<min(tilesX, (b1 * 8 + TW - 1) / TW) {
                let i = ty * tilesX + tx; fastTiles[i] = true; tileTime[i] = ts; if typing { typedTiles[i] = true }; sentHash[i] = tileHash(i, prev); beforeHash[i] = 0 } }
            copy = header(6, m.src.0, m.src.1, m.src.2, m.src.3, 4) + [UInt8(truncatingIfNeeded: dx), UInt8(truncatingIfNeeded: dx >> 8), UInt8(truncatingIfNeeded: dy), UInt8(truncatingIfNeeded: dy >> 8)]
        }
        // the first frame goes out whole: the tablet still shows Sidecar's own page, not white
        var mask = firstFrame && pb != nil ? [Bool](repeating: true, count: tilesX * tilesY)
                 : box.x1 > box.x0 ? changed(box.x0, box.y0, box.x1, box.y1) : [Bool](repeating: false, count: tilesX * tilesY)
        if pb != nil { firstFrame = false }
        for i in 0..<mask.count where mask[i] {
            let h = tileHash(i)
            if blinkFilter && !typing && h == beforeHash[i] && blinkBack(i) {   // the caret's blink back: the tablet keeps it shown
                let tx = i % tilesX, ty = i / tilesX
                for y in (ty * TH)..<min(H, (ty + 1) * TH) { let o = y * stride; for b in (tx * TW / 8)..<min(stride, (tx + 1) * TW / 8) { cur[o + b] = prev[o + b] } }
                mask[i] = false; continue
            }
            if h != sentHash[i] { beforeHash[i] = sentHash[i]; sentHash[i] = h }
            if typing { typedTiles[i] = true }
        }
        let rects = rectsOf(mask)
        if !rects.isEmpty { let t = now(); for i in 0..<mask.count where mask[i] { fastTiles[i] = true; tileTime[i] = t } }
        if !rects.isEmpty && fastMode == false { writeFull(header(2, fastMode0, 0, 0, 0, 0), 16); fastMode = true }   // moving again: the pen's waveform
        if var c = copy { c[11] = rects.isEmpty ? 0 : 1; writeFull(c, c.count); stats.copies += 1 }
        for (n, (x, y, w, h)) in rects.enumerated() { sendRect(x, y, w, h, bitsOf(x, y, w, h), more: n < rects.count - 1) }
        let t2 = now()
        for _ in rects { acks.wait() }
        for i in 0..<prev.count where prev[i] != cur[i] { dirty[i] |= prev[i] ^ cur[i]; prev[i] = cur[i] }
        if firstFull && pb != nil {   // the session's first picture: a full refresh, and nothing left to clean
            writeFull(header(3, 0, 0, 0, 0, 0), 16); firstFull = false
            for i in 0..<dirty.count { dirty[i] = 0 }; for i in 0..<fastTiles.count { fastTiles[i] = false }
        }
        if moved && movedAt > 0 { prof.pointer.append(now() - movedAt); lock.lock(); if pointerAt == movedAt { pointerAt = 0 }; lock.unlock() }
        stats.frames += 1; stats.rects += rects.count; stats.dither += t1 - t0; stats.wait += now() - t2
        if now() - stats.t >= 2000 {
            let f = max(stats.frames, 1)
            let line = String(format: "%5.1f frames/s  %4.1f rects/frame  %6.0f KB/s  dither+diff %4.1f ms  tablet %4.1f ms", Double(stats.frames) / (now() - stats.t) * 1000,
                         Double(stats.rects) / Double(f), Double(stats.bytes) / (now() - stats.t), stats.dither / Double(f), stats.wait / Double(f))
            let lz = rawBytes > 0 ? 100 - stats.bytes * 100 / rawBytes : 0
            let profile = "capture age \(spread(prof.age))  pointer to tablet \(spread(prof.pointer))  cleans \(prof.clean.count) \(spread(prof.clean))  scroll copies \(stats.copies)  gpu \(gpuFrames)  codec -\(lz)%   (median/max)"
            prof = ([], [], []); rawBytes = 0; gpuFrames = 0
            print(line); print(profile)
            var both = line + "\n" + profile
            lock.lock(); let p = profileOn, ps = panelStats; lock.unlock()
            if p && caps.contains("sched") {   // the tablet's side: what the panel did
                let pl = String(format: "panel: %.1f updates/s  held %d  busy %d%%  moves Pen %d ms colour %d ms full %d ms  starts after %d ms  %d rects",
                                Double(ps[0].0) / 2, ps[0].1, ps[0].2 / 10, ps[1].0, ps[1].1, ps[1].2, ps[2].0, ps[2].1)
                print(pl); both += "\n" + pl
            }
            DispatchQueue.main.async { panel.stats = both }
            stats = (0, 0, 0, 0, 0, 0, now())
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
        let age = (CMClockGetTime(CMClockGetHostTimeClock()).seconds - sb.presentationTimeStamp.seconds) * 1000
        lock.lock(); latest = pb; latestAge = age; frameDirty = frameDirty.union(changed); lock.unlock(); ready.signal()
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
    c.minimumFrameInterval = CMTime(value: 1, timescale: 120)
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
                Picker("Greys", selection: $p.tune.dither) { Text("Pictures only").tag(3); Text("Blue noise").tag(2); Text("Bayer").tag(1); Text("Threshold").tag(0) }.pickerStyle(.segmented)
                Picker("Dark areas", selection: $p.tune.invert) { Text("Turned").tag(1); Text("Kept").tag(0); Text("Whole screen").tag(2) }.pickerStyle(.segmented)
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
                Knob(name: "Typing / scroll pause", value: $p.tune.typing, range: 0...3000, step: 50, unit: " ms")
                Knob(name: "Screen frames per second", value: $p.tune.framesHz, range: 2...60)
                Toggle("Keep a blinking caret shown (no blink)", isOn: $p.tune.blink)
                Toggle("Gentle clean (grey checker, no black flash)", isOn: $p.tune.gentle)
                Toggle("Marker as a graphics tablet pen", isOn: $p.tune.tabletPen)
                Toggle("Lock the picture's way up", isOn: $p.tune.rotationLock)
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
// the keyboard, wherever it types (Accessibility, as the touches): only when, never which key
// a scroll too (the Mac's own, or two fingers on the tablet): nothing cleaned while the page moves, then the moved area once it stops
NSEvent.addGlobalMonitorForEvents(matching: [.keyDown, .scrollWheel]) { e in lock.lock(); lastKey = now(); if e.type == .scrollWheel { lastScroll = lastKey }; lock.unlock() }
NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .leftMouseUp, .leftMouseDragged, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseDragged]) { _ in
    lock.lock(); lastMouse = now(); lock.unlock()
}
if control {   // the menu bar app: a tune (JSON), full, clean, quit, quit-tablet or light <permille> per line
    Thread {
        while let l = readLine() {
            if l.hasPrefix("tune "), let t = Tune.from(Data(l.dropFirst(5).utf8)) { lock.lock(); pendingTune = t; lock.unlock(); ready.signal() }
            else if l == "full" || l == "clean" { lock.lock(); pendingAction = l; lock.unlock(); ready.signal() }
            else if l == "quit-tablet" { lock.lock(); pendingAction = l; lock.unlock(); ready.signal() }
            else if l.hasPrefix("light "), let v = Int(l.dropFirst(6)) { lock.lock(); lightTo = max(0, min(1000, v)); lock.unlock(); ready.signal() }
            else if l == "profile on" || l == "profile off" { lock.lock(); profileOn = l == "profile on"; lock.unlock(); ready.signal() }
            else if l == "quit" { break }
        }
        writeFull(header(3, 0, 0, 0, 0, 0), 16); exit(0)   // stdin closed: the app is gone, so is this
    }.start()
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
