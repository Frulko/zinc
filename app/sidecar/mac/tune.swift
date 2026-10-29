// Sidecar's settings, shared by the engine (main.swift) and the menu bar app (tray.swift): every knob, and the presets.
import Foundation

struct Tune: Equatable, Codable {
    var black = 90.0, white = 185.0, gamma = 1.6, edges = 10.0, edgeFloor = 4.0
    var dither = 3                 // 0 threshold, 1 Bayer 8x8, 2 blue noise, 3 blue noise on pictures only (the interface pure ink or paper)
    var cursor = 28.0, moving = 1, dot = 8.0, pointerHz = 12.0, trail = 1500.0
    var fastMode = 0, idle = 1500.0, minClean = 1.0, greys = false
    var typing = 800.0, framesHz = 60.0, blink = true
    var hold = true                // the tablet holds what would land on pixels still moving (ghosts, colour residue otherwise)
    var holdPen = 450.0, holdColour = 1200.0, holdFull = 2500.0   // how long the panel drives each kind of update, ms
    var mouse = 500.0              // ms the mouse (or a finger, the Marker) must rest before anything is cleaned; 0: only around the pointer
    var gentle = true              // clean through a grey checker instead of a black flash
    var tabletPen = false          // the Marker as a graphics tablet's pen (pressure, tilt, hover), not a mouse
    var rotationLock = false       // the picture keeps its way up whatever the accelerometer says
    var invert = 1                 // dark areas (a dark mode's windows): 0 kept, 1 turned to ink on paper, 2 the whole screen turned
    var greyLevels = 0             // the true greys of a clean pass: 0 all 256, 16 (the panel's own) or 4, blue noise between two levels
}

extension Tune {
    /** A tune from JSON, the knobs it does not name (saved by an older Sidecar) at their defaults. */
    static func from(_ data: Data) -> Tune? {
        guard var d = try? JSONSerialization.jsonObject(with: JSONEncoder().encode(Tune())) as? [String: Any],
              let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        d.merge(saved) { _, new in new }
        if saved["invert"] == nil { d["dither"] = 3 }   // saved before "pictures only": its grid or noise dotted every grey line of the interface
        return (try? JSONSerialization.data(withJSONObject: d)).flatMap { try? JSONDecoder().decode(Tune.self, from: $0) }
    }
}

struct Preset: Identifiable {
    let id: String, icon: String, title: String, line: String
    let tune: Tune
}

/** Text first: what a monitor is mostly for. Each preset is a whole Tune; the knobs move from there. */
let presets: [Preset] = {
    var text = Tune()
    text.framesHz = 30
    var speed = Tune()
    speed.framesHz = 60; speed.pointerHz = 20; speed.idle = 3000; speed.trail = 1000; speed.typing = 1500; speed.mouse = 1000; speed.gentle = false
    var video = Tune()
    video.black = 40; video.white = 220; video.gamma = 1.0; video.edges = 0; video.framesHz = 20; video.idle = 0; video.blink = false; video.invert = 0; video.dither = 2
    var reading = Tune()
    reading.black = 100; reading.white = 200; reading.edges = 6; reading.framesHz = 10; reading.idle = 800; reading.mouse = 300; reading.greys = true
    // experimental: the fast waveform and dots while anything moves, the panel's 16 true greys as soon as a place rests
    var hybrid = Tune()
    hybrid.dither = 3; hybrid.greys = true; hybrid.greyLevels = 16; hybrid.idle = 700; hybrid.minClean = 0.2; hybrid.mouse = 400; hybrid.typing = 600
    return [
        Preset(id: "text", icon: "text.cursor", title: "Text", line: "Code, mail, notes: sharp letters, a steady caret, no flash while you type.", tune: text),
        Preset(id: "speed", icon: "hare", title: "Speed", line: "Everything moves at once: the most frames, cleaning waits until you stop.", tune: speed),
        Preset(id: "video", icon: "film", title: "Video", line: "Pictures that move: soft greys from blue noise, never a cleaning flash.", tune: video),
        Preset(id: "hybrid", icon: "circle.lefthalf.filled", title: "Hybrid (experimental)", line: "Fast black and white dots while things move, the panel's 16 true greys as soon as they rest.", tune: hybrid),
        Preset(id: "reading", icon: "book", title: "Reading", line: "Long pages: calm, few frames, true greys once the page rests.", tune: reading),
    ]
}()

// --- the dither's threshold maps, shared by the engine and the settings' previews
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
/** The threshold map, 64x64, of a --dither kind: one level (threshold), Bayer 8x8 tiled, or blue noise. */
func thresholdMap(_ kind: Int) -> [UInt8] {
    switch kind {
    case 0: return [UInt8](repeating: 128, count: 64 * 64)
    case 1: return (0..<64 * 64).map { UInt8(Int(bayer[($0 / 64 & 7) * 8 + ($0 & 7)]) * 4 + 2) }
    default: return blueNoise.map { max(1, $0) }   // 0 is always ink, 255 always paper ("pictures only" cuts the interface to them)
    }
}
