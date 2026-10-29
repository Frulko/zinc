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
}

extension Tune {
    /** A tune from JSON, the knobs it does not name (saved by an older Sidecar) at their defaults. */
    static func from(_ data: Data) -> Tune? {
        guard var d = try? JSONSerialization.jsonObject(with: JSONEncoder().encode(Tune())) as? [String: Any],
              let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        d.merge(saved) { _, new in new }
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
    speed.framesHz = 60; speed.pointerHz = 20; speed.idle = 3000; speed.trail = 1000; speed.typing = 1500; speed.mouse = 1000; speed.gentle = false; speed.dither = 1
    var video = Tune()
    video.black = 40; video.white = 220; video.gamma = 1.0; video.edges = 0; video.framesHz = 20; video.idle = 0; video.blink = false; video.invert = 0; video.dither = 2
    var reading = Tune()
    reading.black = 100; reading.white = 200; reading.edges = 6; reading.framesHz = 10; reading.idle = 800; reading.mouse = 300; reading.greys = true
    return [
        Preset(id: "text", icon: "text.cursor", title: "Text", line: "Code, mail, notes: sharp letters, a steady caret, no flash while you type.", tune: text),
        Preset(id: "speed", icon: "hare", title: "Speed", line: "Everything moves at once: the most frames, cleaning waits until you stop.", tune: speed),
        Preset(id: "video", icon: "film", title: "Video", line: "Pictures that move: soft greys from blue noise, never a cleaning flash.", tune: video),
        Preset(id: "reading", icon: "book", title: "Reading", line: "Long pages: calm, few frames, true greys once the page rests.", tune: reading),
    ]
}()
