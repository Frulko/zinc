// Zinc Sidecar's menu bar app: start and stop the stream, pick how the tablet is used (a second screen, a mirror, a pen tablet), pick a
// preset, and tune every knob in a settings window that says what each one does. It drives the engine (main.swift, sidecar-engine beside
// this binary) as a child: settings as JSON lines on its stdin, its state read from its stdout.
import AppKit
import SwiftUI

enum Mode: String, CaseIterable, Identifiable {
    case extend, mirror, pen
    var id: String { rawValue }
    var title: String { ["extend": "Second screen", "mirror": "Mirror", "pen": "Pen tablet"][rawValue]! }
    var icon: String { ["extend": "rectangle.on.rectangle", "mirror": "rectangle.2.swap", "pen": "pencil.and.scribble"][rawValue]! }
    var line: String {
        ["extend": "A new display at the tablet's shape: drag windows onto it.",
         "mirror": "One of your screens, copied onto the tablet.",
         "pen": "A screen copied, and the Marker draws on it like a graphics tablet: pressure, tilt, hover."][rawValue]!
    }
}

struct Display: Identifiable, Hashable { let id: Int; let name: String }
/** The Mac's displays in the engine's order (CGGetActiveDisplayList: --mirror takes the index). */
func displays() -> [Display] {
    var ids = [CGDirectDisplayID](repeating: 0, count: 16); var n: UInt32 = 0
    CGGetActiveDisplayList(16, &ids, &n)
    return (0..<Int(n)).compactMap { i in
        let name = NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID) == ids[i] }?.localizedName
        if name == "reMarkable Paper Pro" { return nil }   // the engine's own virtual display
        return Display(id: i, name: name ?? "Display \(i + 1)")
    }
}

final class Engine: ObservableObject {
    enum State: Equatable { case stopped, starting, waiting, connected(String) }
    @Published var state = State.stopped
    @Published var stats = ""
    @Published var problem = ""
    @Published var tune: Tune { didSet { if tune != oldValue { save(); if !echo { send("tune " + json(tune)) } } } }
    @Published var mode: Mode { didSet { if mode != oldValue { UserDefaults.standard.set(mode.rawValue, forKey: "mode"); restartIfRunning() } } }
    @Published var display: Int { didSet { if display != oldValue { UserDefaults.standard.set(display, forKey: "display"); if mode != .extend { restartIfRunning() } } } }
    private var process: Process?, input: FileHandle?, buffer = Data(), echo = false, restarting = false

    init() {
        let d = UserDefaults.standard
        tune = (d.data(forKey: "tune")).flatMap { try? JSONDecoder().decode(Tune.self, from: $0) } ?? presets[0].tune
        mode = Mode(rawValue: d.string(forKey: "mode") ?? "") ?? .extend
        display = d.integer(forKey: "display")
    }
    var running: Bool { process != nil }
    var preset: String? {
        presets.first { p in var a = p.tune, b = tune; a.tabletPen = b.tabletPen; a.rotationLock = b.rotationLock; a.cursor = b.cursor; return a == b }?.id
    }
    func choose(_ p: Preset) { var t = p.tune; t.tabletPen = tune.tabletPen; t.rotationLock = tune.rotationLock; t.cursor = tune.cursor; tune = t }
    private func json(_ t: Tune) -> String { String(decoding: (try? JSONEncoder().encode(t)) ?? Data(), as: UTF8.self) }
    private func save() { UserDefaults.standard.set(try? JSONEncoder().encode(tune), forKey: "tune") }
    func send(_ line: String) { try? input?.write(contentsOf: Data((line + "\n").utf8)) }

    func start() {
        guard process == nil else { return }
        let exe = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent().appendingPathComponent("sidecar-engine")
        let p = Process()
        p.executableURL = exe
        var args = ["--no-ui", "--control"]
        if mode != .extend { args += ["--mirror", String(display)] }
        p.arguments = args
        let i = Pipe(), o = Pipe()
        p.standardInput = i; p.standardOutput = o; p.standardError = o
        o.fileHandleForReading.readabilityHandler = { [weak self] h in
            let d = h.availableData
            DispatchQueue.main.async { self?.take(d) }
        }
        p.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.ended() } }
        do { try p.run() } catch { problem = "Cannot start the engine: \(error.localizedDescription)"; return }
        process = p; input = i.fileHandleForWriting
        problem = ""; state = .starting
        var t = tune; if mode == .pen { t.tabletPen = true }
        send("tune " + json(t))
    }
    func stop() { send("quit"); input = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.process?.terminate() } }
    private func restartIfRunning() { if running { restarting = true; stop() } }
    private func ended() {
        process = nil; input = nil; state = .stopped; stats = ""
        if restarting { restarting = false; start() }
    }
    private func take(_ d: Data) {
        buffer.append(d)
        while let n = buffer.firstIndex(of: 10) {
            let line = String(decoding: buffer[buffer.startIndex..<n], as: UTF8.self); buffer.removeSubrange(buffer.startIndex...n)
            if line.hasPrefix("waiting for the tablet") { state = .waiting }
            else if line.hasPrefix("tablet: ") { state = .connected(String(line.dropFirst(8))) }
            else if line.hasPrefix("tune "), let t = try? JSONDecoder().decode(Tune.self, from: Data(line.dropFirst(5).utf8)) { echo = true; tune = t; echo = false }
            else if line.contains("frames/s") { stats = line.trimmingCharacters(in: .whitespaces) }
            else if line.hasPrefix("sidecar: ") { problem = String(line.dropFirst(9)) }
        }
    }
}

// --- the popover
struct StatusDot: View {
    let state: Engine.State
    var body: some View {
        let (color, text): (Color, String) = {
            switch state {
            case .stopped: return (.secondary, "Stopped")
            case .starting: return (.orange, "Starting…")
            case .waiting: return (.orange, "Open Sidecar on the reMarkable")
            case .connected(let what): return (.green, "On the tablet · " + what)
            }
        }()
        return HStack(spacing: 6) { Circle().fill(color).frame(width: 8, height: 8); Text(text).font(.callout).foregroundStyle(.secondary).lineLimit(1) }
    }
}

struct PresetCard: View {
    let p: Preset; let on: Bool; let pick: () -> Void
    var body: some View {
        Button(action: pick) {
            VStack(alignment: .leading, spacing: 4) {
                HStack { Image(systemName: p.icon).font(.title3); Spacer(); if on { Image(systemName: "checkmark.circle.fill").foregroundStyle(.tint) } }
                Text(p.title).font(.headline)
                Text(p.line).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            .padding(10).frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 10).fill(on ? Color.accentColor.opacity(0.15) : Color.primary.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? Color.accentColor : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }
}

struct PopoverView: View {
    @ObservedObject var e: Engine
    let settings: () -> Void
    @State private var screens = displays()
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Image(systemName: "rectangle.portrait.on.rectangle.portrait.angled").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) { Text("Zinc Sidecar").font(.title3.bold()); StatusDot(state: e.state) }
                Spacer()
                Button(e.running ? "Stop" : "Start") { e.running ? e.stop() : e.start() }
                    .buttonStyle(.borderedProminent).tint(e.running ? .red : .accentColor).controlSize(.large)
            }
            if !e.problem.isEmpty { Text(e.problem).font(.caption).foregroundStyle(.red) }

            Picker("", selection: $e.mode) { ForEach(Mode.allCases) { m in Label(m.title, systemImage: m.icon).tag(m) } }
                .pickerStyle(.segmented).labelsHidden()
            Text(e.mode.line).font(.caption).foregroundStyle(.secondary)
            if e.mode != .extend {
                Picker("Screen", selection: $e.display) { ForEach(screens) { Text($0.name).tag($0.id) } }
                    .onAppear { screens = displays() }
            }

            Text("Preset").font(.subheadline.bold())
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(presets) { p in PresetCard(p: p, on: e.preset == p.id) { e.choose(p) } }
            }

            HStack {
                Button { e.send("full") } label: { Label("Full refresh", systemImage: "sparkles") }
                Button { e.send("clean") } label: { Label("Clean ghosts", systemImage: "wand.and.stars") }
                Spacer()
            }
            .disabled(!e.running)
            if !e.stats.isEmpty { Text(e.stats).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1) }
            Divider()
            HStack {
                Button("Settings…", action: settings)
                Spacer()
                Button("Quit") { if e.running { e.stop() }; DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { NSApp.terminate(nil) } }
            }
        }
        .padding(16).frame(width: 380)
    }
}

// --- the settings window: every knob, each with a line that says what it does on paper
struct Knob: View {
    let name: String, help: String; @Binding var value: Double; let range: ClosedRange<Double>; var step = 1.0; var unit = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(name)
                Slider(value: $value, in: range, step: step)
                Text(step < 1 ? String(format: "%.2f", value) : "\(Int(value))\(unit)").monospacedDigit().foregroundStyle(.secondary).frame(width: 64, alignment: .trailing)
            }
            Text(help).font(.caption).foregroundStyle(.secondary)
        }
    }
}
struct Switch: View {
    let name: String, help: String; @Binding var on: Bool
    var body: some View { VStack(alignment: .leading, spacing: 2) { Toggle(name, isOn: $on); Text(help).font(.caption).foregroundStyle(.secondary) } }
}

struct SettingsView: View {
    @ObservedObject var e: Engine
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                ForEach(presets) { p in
                    Button { e.choose(p) } label: { Label(p.title, systemImage: p.icon) }
                        .buttonStyle(.bordered).tint(e.preset == p.id ? .accentColor : nil)
                }
                Spacer()
                Text(e.preset == nil ? "Custom" : "").foregroundStyle(.secondary)
            }
            .padding(12)
            TabView {
                Form {
                    Section("Ink and paper") {
                        Knob(name: "Black point", help: "Everything darker than this becomes ink. Raise it when letters look thin.", value: $e.tune.black, range: 0...200)
                        Knob(name: "White point", help: "Everything lighter than this becomes paper. Lower it to wipe grey backgrounds clean.", value: $e.tune.white, range: 100...255)
                        Knob(name: "Gamma", help: "Bends the middle greys. Above 1, letters get bolder; below, photos get lighter.", value: $e.tune.gamma, range: 0.5...3, step: 0.05)
                    }
                    Section("Thin lines") {
                        Knob(name: "Edges", help: "Hairlines (window borders, separators) are pale grey: this draws them in ink so they do not vanish.", value: $e.tune.edges, range: 0...30)
                        Knob(name: "Edge threshold", help: "How faint a line may be and still get drawn. Lower catches more, and more noise.", value: $e.tune.edgeFloor, range: 0...30)
                    }
                    Section("Greys") {
                        Picker("Pattern", selection: $e.tune.dither) { Text("Blue noise").tag(2); Text("Grid").tag(1); Text("None").tag(0) }.pickerStyle(.segmented)
                        Text("The panel only has black and white while things move: greys become dots. Blue noise scatters them like ink spray, the grid lines them up like an old newspaper, none keeps pure black and white.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .formStyle(.grouped).tabItem { Label("Picture", systemImage: "photo") }

                Form {
                    Section("Look") {
                        Knob(name: "Size", help: "The pointer's height on the tablet. It follows macOS: arrow, text bar or hand.", value: $e.tune.cursor, range: 19...56, unit: " px")
                        Picker("While moving", selection: $e.tune.moving) { Text("Arrow").tag(0); Text("Dot").tag(1); Text("Nothing").tag(2) }.pickerStyle(.segmented)
                        Text("A moving shape leaves a ghost on paper: a small dot leaves almost none, and the arrow is back as soon as it stops.").font(.caption).foregroundStyle(.secondary)
                        Knob(name: "Dot", help: "The moving dot's size.", value: $e.tune.dot, range: 3...20, unit: " px")
                    }
                    Section("Motion") {
                        Knob(name: "Moves per second", help: "More is smoother, but each move is a flash of ink; 12 is calm.", value: $e.tune.pointerHz, range: 5...120)
                        Knob(name: "Trail cleaned after", help: "The paper needs about 1.4 s to settle; cleaning sooner smudges it.", value: $e.tune.trail, range: 0...3000, step: 50, unit: " ms")
                    }
                }
                .formStyle(.grouped).tabItem { Label("Pointer", systemImage: "cursorarrow") }

                Form {
                    Section("Speed") {
                        Knob(name: "Frames per second", help: "The most pictures sent each second. Fewer is calmer and cleaner.", value: $e.tune.framesHz, range: 2...60)
                        Picker("Fast waveform", selection: $e.tune.fastMode) { Text("Fastest").tag(0); Text("DU").tag(1); Text("A2").tag(2) }.pickerStyle(.segmented)
                    }
                    Section("Ghosts") {
                        Knob(name: "Clean after rest", help: "Once a place has been still this long its ghosts are wiped. 0: never.", value: $e.tune.idle, range: 0...5000, step: 100, unit: " ms")
                        Knob(name: "Clean from (% of screen)", help: "Tiny changes (a clock, a caret) never deserve a flash.", value: $e.tune.minClean, range: 0.05...10, step: 0.05)
                        Knob(name: "Typing and scrolling pause", help: "Nothing is wiped while you type or scroll; when you stop, just the lines you touched.", value: $e.tune.typing, range: 0...3000, step: 50, unit: " ms")
                        Switch(name: "Gentle clean", help: "Wipes through a grey checker instead of a black flash: softer on the eyes.", on: $e.tune.gentle)
                        Switch(name: "True greys when clean", help: "Pages that rest get real grey levels. Prettier, but the panel switches modes (a slower moment).", on: $e.tune.greys)
                        Switch(name: "Steady caret", help: "A blinking text caret stays shown: every blink would leave a little ghost.", on: $e.tune.blink)
                    }
                    Section {
                        HStack { Button("Full refresh") { e.send("full") }; Button("Clean ghosts now") { e.send("clean") }; Spacer(); Button("Back to the preset's values") { e.choose(presets.first { $0.id == e.preset } ?? presets[0]) } }
                    }
                }
                .formStyle(.grouped).tabItem { Label("Refresh", systemImage: "arrow.clockwise") }

                Form {
                    Section("The Marker") {
                        Switch(name: "Graphics tablet pen", help: "Drawing apps get pressure, tilt and hover, as from a Wacom. Off: the Marker is a mouse.", on: $e.tune.tabletPen)
                        Switch(name: "Lock the way up", help: "The picture keeps its orientation when you turn the tablet.", on: $e.tune.rotationLock)
                    }
                    Section("On the tablet") {
                        Gesture(icon: "hand.point.up", text: "One finger: the mouse. Tap to click, drag to drag.")
                        Gesture(icon: "hand.draw", text: "Two fingers: scroll, the way the page moves under them.")
                        Gesture(icon: "hand.tap", text: "Two-finger tap: a full refresh, every ghost gone.")
                        Gesture(icon: "rectangle.topthird.inset.filled", text: "Three-finger tap: the quick panel (clean, preset, contrast, lock).")
                        Gesture(icon: "power", text: "Hold the power button 2 s (or three fingers 2 s): back to the reMarkable.")
                    }
                }
                .formStyle(.grouped).tabItem { Label("Pen & gestures", systemImage: "pencil.tip") }
            }
            .padding([.horizontal, .bottom], 12)
            if !e.stats.isEmpty { Text(e.stats).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary).padding(.bottom, 8) }
        }
        .frame(width: 600, height: 640)
    }
}
struct Gesture: View {
    let icon: String, text: String
    var body: some View { Label { Text(text) } icon: { Image(systemName: icon).frame(width: 24) } }
}

// --- the app: a menu bar item, no Dock icon
final class App: NSObject, NSApplicationDelegate {
    let engine = Engine()
    var item: NSStatusItem!, popover = NSPopover(), window: NSWindow?
    func applicationDidFinishLaunching(_ n: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "rectangle.portrait.on.rectangle.portrait.angled", accessibilityDescription: "Zinc Sidecar")
        item.button?.action = #selector(toggle); item.button?.target = self
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: PopoverView(e: engine) { [weak self] in self?.settings() })
        if CommandLine.arguments.contains("--start") { engine.start() }
    }
    @objc func toggle() {
        if popover.isShown { popover.performClose(nil) }
        else if let b = item.button { popover.show(relativeTo: b.bounds, of: b, preferredEdge: .minY); popover.contentViewController?.view.window?.makeKey() }
    }
    func settings() {
        popover.performClose(nil)
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 600, height: 640), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
            w.title = "Zinc Sidecar"; w.isReleasedWhenClosed = false
            w.contentView = NSHostingView(rootView: SettingsView(e: engine)); w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true); window?.makeKeyAndOrderFront(nil)
    }
    func applicationWillTerminate(_ n: Notification) { if engine.running { engine.send("quit") } }
}

@main enum Main {
    static func main() {
        let app = NSApplication.shared
        let delegate = App()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
