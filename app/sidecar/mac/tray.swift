// Zinc Sidecar's menu bar app: pick the output (the reMarkable on USB, or a colour screen on the network), start and stop the stream, pick
// how the output is used (a second screen, a mirror, a pen tablet on the reMarkable), and the output's own settings: the e-ink presets and
// knobs for the tablet, the sharpness and the codec for a screen. Each output keeps its mode and settings. It drives the engine of the
// output as a child (main.swift's sidecar-engine: JSON lines on its stdin; screen.swift's sidecar-screen: arguments), its state read from
// its stdout.
import AppKit
import SwiftUI

/** Where the picture goes: the reMarkable (e-ink, USB, sidecar-engine) or a colour screen on the network (sidecar-screen). */
struct Output: Codable, Identifiable, Hashable {
    enum Kind: String, Codable { case remarkable, screen }
    var id: String, kind: Kind, name: String, host: String
    var hidpi = false, lz4 = false   // a screen's: drawn at twice its points (Retina), lz4 for a screen whose CPU is short
    var icon: String { kind == .remarkable ? "ipad.landscape" : "display" }
    var modes: [Mode] { kind == .remarkable ? Mode.allCases : [.extend, .mirror] }
    static let remarkable = Output(id: "rmpp", kind: .remarkable, name: "reMarkable Paper Pro", host: "10.11.99.1")
}

enum Mode: String, CaseIterable, Identifiable {
    case extend, mirror, pen
    var id: String { rawValue }
    var title: String { ["extend": "Second screen", "mirror": "Mirror", "pen": "Pen tablet"][rawValue]! }
    var icon: String { ["extend": "rectangle.on.rectangle", "mirror": "rectangle.2.swap", "pen": "pencil.and.scribble"][rawValue]! }
    var line: String {
        ["extend": "A new display at its shape: drag windows onto it.",
         "mirror": "One of your screens, copied onto it.",
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
        if name == "reMarkable Paper Pro" || name == "Sidecar Screen" { return nil }   // the engines' own virtual displays
        return Display(id: i, name: name ?? "Display \(i + 1)")
    }
}

/** macOS's text caret: every blink of it ghosts on e-ink. Held steady while the stream runs (the global NSTextInsertionPointBlinkPeriod
 *  settings, read by apps when they start), put back as it was after, and at the next launch when the app did not end cleanly. */
enum Caret {
    static let keys = ["NSTextInsertionPointBlinkPeriodOn", "NSTextInsertionPointBlinkPeriodOff"]
    static func steady() {
        if UserDefaults.standard.dictionary(forKey: "caretSaved") == nil {
            var saved: [String: Any] = [:]
            for k in keys { saved[k] = get(k) ?? "unset" }
            UserDefaults.standard.set(saved, forKey: "caretSaved")
        }
        set(keys[0], 999_999_999.0 as CFNumber); set(keys[1], 0.0 as CFNumber)
    }
    static func restore() {
        guard let saved = UserDefaults.standard.dictionary(forKey: "caretSaved") else { return }
        for k in keys { set(k, saved[k] as? String == "unset" ? nil : saved[k] as CFPropertyList?) }
        UserDefaults.standard.removeObject(forKey: "caretSaved")
    }
    private static func get(_ k: String) -> CFPropertyList? { CFPreferencesCopyValue(k as CFString, kCFPreferencesAnyApplication, kCFPreferencesCurrentUser, kCFPreferencesAnyHost) }
    private static func set(_ k: String, _ v: CFPropertyList?) {
        CFPreferencesSetValue(k as CFString, v, kCFPreferencesAnyApplication, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
        CFPreferencesSynchronize(kCFPreferencesAnyApplication, kCFPreferencesCurrentUser, kCFPreferencesAnyHost)
    }
}

final class Engine: ObservableObject {
    enum State: Equatable { case stopped, starting, waiting, connected(String) }
    @Published var state = State.stopped
    @Published var stats = ""
    @Published var details = [[String]]()   // [section, name, value] from a screen's engine, every 2 s
    @Published var testing = false          // a speed test runs (the pictures wait for it)
    @Published var problem = ""
    // the profile: the engine's lines (the Mac's work, the capture, the tablet's panel), and a file they go to while recording
    @Published var lines = ["frames": "", "capture": "", "panel": ""]
    @Published var profile = false { didSet { send(profile ? "profile on" : "profile off") } }
    @Published var recording: URL? = nil
    private var record: FileHandle?
    func toggleRecord() {
        if let r = record { try? r.close(); record = nil; recording = nil; return }
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Zinc Sidecar")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd-HHmmss"
        let url = dir.appendingPathComponent("profile-\(f.string(from: Date())).log")
        FileManager.default.createFile(atPath: url.path, contents: Data("Zinc Sidecar profile \(Date())\ntune \(json(tune))\n".utf8))
        record = try? FileHandle(forWritingTo: url); record?.seekToEndOfFile(); recording = url
        if !profile { profile = true }
    }
    @Published var tune: Tune { didSet { if tune != oldValue { save(); if !echo { send("tune " + json(tune)) } } } }
    // the outputs: the reMarkable, then the screens added by hand; each one keeps its mode
    @Published var screens: [Output] { didSet { UserDefaults.standard.set(try? JSONEncoder().encode(screens), forKey: "screens") } }
    @Published var outputId: String {
        didSet {
            guard outputId != oldValue else { return }
            UserDefaults.standard.set(outputId, forKey: "output")
            echoMode = true; mode = Engine.savedMode(current); echoMode = false
            restartIfRunning()
        }
    }
    var outputs: [Output] { [Output.remarkable] + screens }
    var current: Output { outputs.first { $0.id == outputId } ?? .remarkable }
    // the screens whose app said it plays sound (sidecar-screen's "sound: available"), and the ones it goes to (--audio); kept beside
    // `screens` so a saved list from before still decodes
    @Published var soundAvail = Set(UserDefaults.standard.stringArray(forKey: "soundAvail") ?? []) { didSet { UserDefaults.standard.set(Array(soundAvail), forKey: "soundAvail") } }
    func audioOn(_ id: String) -> Bool { UserDefaults.standard.bool(forKey: "audio." + id) }
    func setAudio(_ id: String, _ on: Bool) { UserDefaults.standard.set(on, forKey: "audio." + id); objectWillChange.send(); restartIfRunning() }
    func update(_ o: Output) {
        guard let i = screens.firstIndex(where: { $0.id == o.id }), screens[i] != o else { return }
        screens[i] = o; restartIfRunning()
    }
    func add(name: String, host: String) {
        let o = Output(id: UUID().uuidString, kind: .screen, name: name.isEmpty ? host : name, host: host)
        screens.append(o); outputId = o.id
    }
    func remove(_ o: Output) { if outputId == o.id { outputId = Output.remarkable.id }; screens.removeAll { $0.id == o.id } }
    static func savedMode(_ o: Output) -> Mode {
        let m = Mode(rawValue: UserDefaults.standard.string(forKey: "mode." + o.id) ?? UserDefaults.standard.string(forKey: "mode") ?? "") ?? .extend
        return o.modes.contains(m) ? m : .extend
    }
    private var echoMode = false
    @Published var mode: Mode { didSet { if mode != oldValue && !echoMode { UserDefaults.standard.set(mode.rawValue, forKey: "mode." + outputId); restartIfRunning() } } }
    @Published var steadyCaret: Bool { didSet { UserDefaults.standard.set(steadyCaret, forKey: "steadyCaret"); if running { steadyCaret ? Caret.steady() : Caret.restore() } } }
    @Published var display: Int { didSet { if display != oldValue { UserDefaults.standard.set(display, forKey: "display"); if mode != .extend { restartIfRunning() } } } }
    private var process: Process?, input: FileHandle?, buffer = Data(), echo = false, restarting = false
    // the tablet's frontlight, permille (-1: not told yet); it says it when Sidecar connects
    @Published var light = -1 { didSet { if light != oldValue && !echo && light >= 0 { send("light \(light)") } } }
    // a reMarkable on the USB cable (its address answers): shown, and Sidecar starts on it when asked to
    @Published var plugged = false { didSet { if plugged && !oldValue && autoStart && !running && current.kind == .remarkable { start() } } }
    @Published var autoStart: Bool { didSet { UserDefaults.standard.set(autoStart, forKey: "autoStart") } }
    private var probe: Timer?
    // a screen's receiver app: when the Mac waits for it (the screen shows the player or another app), the tray opens it there through the
    // Zinc agent (zinc device <name> run sidecar-screen), once per start; the button does it by hand
    @Published var launchNote = ""
    private var launched = false
    func openOnScreen() {
        let o = current
        guard o.kind == .screen, let zinc = Engine.zinc() else { launchNote = "No zinc command found to reach the screen's agent."; return }
        let dev = o.host.hasSuffix(".local") ? String(o.host.dropLast(6)) : o.host   // the agent's paired name is its host name
        launchNote = "Opening Sidecar Screen on \(o.name)…"
        DispatchQueue.global().async {
            let p = Process(), pipe = Pipe()
            p.executableURL = URL(fileURLWithPath: zinc); p.arguments = ["device", dev, "run", "sidecar-screen"]
            p.standardOutput = pipe; p.standardError = pipe
            var out = ""
            if (try? p.run()) != nil { out = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self); p.waitUntilExit() }
            let ok = p.terminationStatus == 0
            DispatchQueue.main.async {
                self.launchNote = ok ? "Sidecar Screen opened on \(o.name)." :
                    "Could not open it: \(out.split(separator: "\n").last ?? "zinc device failed"). Install it once: zinc device \(dev) deploy app/sidecar-screen"
            }
        }
    }
    /** The zinc command: the one set with `defaults write dev.zinc.sidecar zinc <path>`, the source tree's this app was built in, else the PATH's. */
    static func zinc() -> String? {
        let me = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().path
        let tree = me.range(of: "/app/sidecar/mac/build/").map { String(me[..<$0.lowerBound]) + "/build/zinc" }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return ([UserDefaults.standard.string(forKey: "zinc"), tree, home + "/.local/bin/zinc", "/opt/homebrew/bin/zinc", "/usr/local/bin/zinc"].compactMap { $0 })
            .first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    init() {
        let d = UserDefaults.standard
        tune = (d.data(forKey: "tune")).flatMap { Tune.from($0) } ?? presets[0].tune
        let saved = (d.data(forKey: "screens")).flatMap { try? JSONDecoder().decode([Output].self, from: $0) } ?? []
        screens = saved
        let id = d.string(forKey: "output") ?? Output.remarkable.id
        outputId = saved.contains { $0.id == id } ? id : Output.remarkable.id
        mode = Engine.savedMode(saved.first { $0.id == id } ?? .remarkable)
        display = d.integer(forKey: "display")
        steadyCaret = d.object(forKey: "steadyCaret") as? Bool ?? true
        autoStart = d.bool(forKey: "autoStart")
        // ssh's port: open on a reMarkable in developer mode as soon as its USB network is up. Not Sidecar's own (a probe there
        // would open a session); the engine waits for that one itself
        probe = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            DispatchQueue.global().async { let up = reachable("10.11.99.1", 22); DispatchQueue.main.async { self?.plugged = up } }
        }
        probe?.fire()
        Caret.restore()   // left set by a run that did not end cleanly
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
        let out = current, eink = out.kind == .remarkable
        let exe = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath().deletingLastPathComponent().appendingPathComponent(eink ? "sidecar-engine" : "sidecar-screen")
        let p = Process()
        p.executableURL = exe
        var args = eink ? ["--no-ui", "--control", "--wait"] : ["--host", out.host] + (out.hidpi ? ["--hidpi"] : []) + (out.lz4 ? ["--lz4"] : []) + (audioOn(out.id) ? ["--audio"] : [])
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
        problem = ""; state = .starting; launched = false; launchNote = ""
        guard eink else { return }   // a screen's engine takes its settings as arguments, and an LCD has no ghosts to spare
        if steadyCaret { Caret.steady() }
        if profile { send("profile on") }
        var t = tune; if mode == .pen { t.tabletPen = true }
        send("tune " + json(t))
    }
    func stop() {
        if current.kind == .screen && input != nil { process?.interrupt(); input = nil; return }
        send("quit"); input = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.process?.terminate() }
    }
    private func restartIfRunning() { if running { restarting = true; stop() } }
    private func ended() {
        process = nil; input = nil; state = .stopped; stats = ""; details = []; echo = true; light = -1; echo = false
        if restarting { restarting = false; start() } else { Caret.restore() }
    }
    private func keep(_ k: String, _ l: String) {
        lines[k] = l.trimmingCharacters(in: .whitespaces)
        if let r = record { let t = String(format: "%.3f ", Date().timeIntervalSince1970); try? r.write(contentsOf: Data((t + k + " " + lines[k]! + "\n").utf8)) }
    }
    private func take(_ d: Data) {
        buffer.append(d)
        while let n = buffer.firstIndex(of: 10) {
            let line = String(decoding: buffer[buffer.startIndex..<n], as: UTF8.self); buffer.removeSubrange(buffer.startIndex...n)
            if line.hasPrefix("waiting for the tablet") || line.hasPrefix("waiting for the screen") {
                state = .waiting
                if line.hasPrefix("waiting for the screen") && !launched { launched = true; openOnScreen() }
            }
            else if line.hasPrefix("tablet: ") { state = .connected(String(line.dropFirst(8))) }
            else if line.hasPrefix("screen: ") { state = .connected(String(line.dropFirst(8))) }
            else if line.hasPrefix("sound: ") { if line.hasPrefix("sound: none") { soundAvail.remove(current.id) } else { soundAvail.insert(current.id) } }
            else if line.hasPrefix("sidecar-screen: ") { problem = String(line.dropFirst(16)) }
            else if line.hasPrefix("speedtest: ") { testing = line == "speedtest: running" }
            else if line.hasPrefix("info "), let d = try? JSONDecoder().decode([[String]].self, from: Data(line.dropFirst(5).utf8)) { details = d }
            else if line.hasPrefix("tune "), let t = Tune.from(Data(line.dropFirst(5).utf8)) { echo = true; tune = t; echo = false }
            else if line.contains("frames/s") { stats = line.trimmingCharacters(in: .whitespaces); keep("frames", line) }
            else if line.hasPrefix("capture age") { keep("capture", line) }
            else if line.hasPrefix("panel: ") { keep("panel", String(line.dropFirst(7))) }
            else if line.hasPrefix("light "), let l = Int(line.dropFirst(6)) { echo = true; light = l; echo = false }
            else if line.hasPrefix("sidecar: ") { problem = String(line.dropFirst(9)) }
        }
    }
}

/** host:port accepts a TCP connection within 0.8 s. */
func reachable(_ host: String, _ port: UInt16) -> Bool {
    let s = socket(AF_INET, SOCK_STREAM, 0); defer { close(s) }
    var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = port.bigEndian; inet_pton(AF_INET, host, &a.sin_addr)
    _ = fcntl(s, F_SETFL, fcntl(s, F_GETFL) | O_NONBLOCK)
    let r = withUnsafePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    if r == 0 { return true }
    guard errno == EINPROGRESS else { return false }
    var p = pollfd(fd: s, events: Int16(POLLOUT), revents: 0)
    guard poll(&p, 1, 800) == 1 else { return false }
    var err: Int32 = 0, n = socklen_t(MemoryLayout<Int32>.size)
    getsockopt(s, SOL_SOCKET, SO_ERROR, &err, &n)
    return err == 0
}

// --- the popover
struct StatusDot: View {
    let state: Engine.State, output: Output; var plugged = true
    var body: some View {
        let eink = output.kind == .remarkable
        let (color, text): (Color, String) = {
            switch state {
            case .stopped: return (.secondary, !eink ? "Stopped" : plugged ? "Stopped · reMarkable plugged in" : "Stopped · no reMarkable on USB")
            case .starting: return (.orange, "Starting…")
            case .waiting: return (.orange, !eink ? "Open Sidecar Screen on \(output.host)" : plugged ? "Open Sidecar on the reMarkable" : "Waiting for a reMarkable on USB…")
            case .connected(let what): return (.green, "On " + what)
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

/** The outputs as cards: the one chosen is outlined; the last card adds a screen. */
struct OutputRow: View {
    @ObservedObject var e: Engine
    @Binding var adding: Bool
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(e.outputs) { o in
                    let on = o.id == e.outputId
                    Button { e.outputId = o.id } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Image(systemName: o.icon).font(.title3)
                            Text(o.name).font(.subheadline.bold()).lineLimit(1)
                            Text(o.kind == .remarkable ? (e.plugged ? "USB · plugged in" : "USB · not plugged") : o.host).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                        .padding(8).frame(width: 128, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 9).fill(on ? Color.accentColor.opacity(0.15) : Color.primary.opacity(0.05)))
                        .overlay(RoundedRectangle(cornerRadius: 9).stroke(on ? Color.accentColor : .clear, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                }
                Button { adding.toggle() } label: {
                    VStack(spacing: 3) { Image(systemName: "plus").font(.title3); Text("Add a screen").font(.caption) }
                        .frame(width: 96, height: 62)
                        .background(RoundedRectangle(cornerRadius: 9).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4])).foregroundStyle(.secondary))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct AddScreen: View {
    @ObservedObject var e: Engine
    @Binding var adding: Bool
    @State private var name = ""
    @State private var host = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("A screen running Sidecar Screen (app/sidecar-screen) shows its address.").font(.caption).foregroundStyle(.secondary)
            HStack {
                TextField("Name (Raspberry Pi)", text: $name).textFieldStyle(.roundedBorder)
                TextField("Address", text: $host).textFieldStyle(.roundedBorder)
                Button("Add") { e.add(name: name, host: host.trimmingCharacters(in: .whitespaces)); adding = false }
                    .disabled(host.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}

struct PopoverView: View {
    @ObservedObject var e: Engine
    let settings: () -> Void, showDetails: () -> Void
    @State private var monitors = displays()
    @State private var adding = false
    var body: some View {
        let o = e.current, eink = o.kind == .remarkable
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                Image(systemName: "rectangle.portrait.on.rectangle.portrait.angled").font(.title2).foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 2) { Text("Zinc Sidecar").font(.title3.bold()); StatusDot(state: e.state, output: o, plugged: e.plugged) }
                Spacer()
                Button(e.running ? "Stop" : "Start") { e.running ? e.stop() : e.start() }
                    .buttonStyle(.borderedProminent).tint(e.running ? .red : .accentColor).controlSize(.large)
            }
            if !e.problem.isEmpty {
                if e.problem.contains("TCC") || e.problem.contains("Screen Recording") {
                    HStack {
                        Text("Zinc Sidecar needs the Screen Recording permission.").font(.caption).foregroundStyle(.red)
                        Spacer()
                        Button("Open Settings") { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!) }.controlSize(.small)
                    }
                } else { Text(e.problem).font(.caption).foregroundStyle(.red).lineLimit(3) }
            }

            Text("Output").font(.subheadline.bold())
            OutputRow(e: e, adding: $adding)
            if adding { AddScreen(e: e, adding: $adding) }

            Picker("", selection: $e.mode) { ForEach(o.modes) { m in Label(m.title, systemImage: m.icon).tag(m) } }
                .pickerStyle(.segmented).labelsHidden()
            Text(e.mode.line).font(.caption).foregroundStyle(.secondary)
            if e.mode != .extend {
                Picker("Screen", selection: $e.display) { ForEach(monitors) { Text($0.name).tag($0.id) } }
                    .onAppear { monitors = displays() }
            }

            if eink {
                Toggle("Start when a reMarkable is plugged in", isOn: $e.autoStart).font(.caption)
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
                if e.light >= 0 {
                    HStack {
                        Image(systemName: "sun.min")
                        Slider(value: Binding(get: { Double(e.light) }, set: { e.light = Int($0) }), in: 0...1000)
                        Image(systemName: "sun.max")
                    }
                    .help("The tablet's frontlight")
                }
                if case .connected = e.state {
                    Button(role: .destructive) { e.send("quit-tablet") } label: { Label("Quit Sidecar on the tablet", systemImage: "power") }
                        .help("Ends the app on the reMarkable: its own screen comes back")
                }
            } else {
                Toggle("Retina: twice the pixels per point (bigger text)", isOn: Binding(get: { o.hidpi }, set: { v in var c = o; c.hidpi = v; e.update(c) }))
                if e.soundAvail.contains(o.id) {   // only once the screen said it plays sound
                    Toggle("Sound: the Mac's sound plays on this screen", isOn: Binding(get: { e.audioOn(o.id) }, set: { e.setAudio(o.id, $0) }))
                        .help("The Mac goes quiet while it streams; macOS asks once to let Sidecar record the system's audio")
                }
                Picker("Compression", selection: Binding(get: { o.lz4 }, set: { v in var c = o; c.lz4 = v; e.update(c) })) {
                    Text("zstd: fewest bytes").tag(false); Text("lz4: lightest for the screen").tag(true)
                }
                .pickerStyle(.segmented)
                Text("Only the tiles that change are sent, filtered and compressed on every core. zstd suits Wi-Fi; lz4 a slow screen on a fast cable.").font(.caption).foregroundStyle(.secondary)
                if e.state == .waiting || !e.launchNote.isEmpty {
                    HStack(alignment: .top) {
                        Text(e.launchNote.isEmpty ? "The screen does not answer: Sidecar Screen is not open on it." : e.launchNote).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        Spacer()
                        Button("Open it there") { e.openOnScreen() }.controlSize(.small)
                    }
                }
                HStack {
                    Text(o.host).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button("Remove this screen", role: .destructive) { e.remove(o) }.controlSize(.small).disabled(e.running)
                }
            }
            if !e.stats.isEmpty { Text(e.stats).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1) }
            Divider()
            HStack {
                if eink { Button("reMarkable settings…", action: settings) }
                else { Button { showDetails() } label: { Label("Details…", systemImage: "info.circle") } }
                Spacer()
                Button("Quit") { if e.running { e.stop() }; DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { NSApp.terminate(nil) } }
            }
        }
        .padding(16).frame(width: 400)
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
                        Picker("Dark areas", selection: $e.tune.invert) { Text("Turned").tag(1); Text("Kept").tag(0); Text("Whole screen").tag(2) }.pickerStyle(.segmented)
                        Text("A dark mode's windows (Discord, a code editor) are pale letters on near-black: on paper a field of ink. Turned, they read as ink on paper, and the light windows around them stay as they are.").font(.caption).foregroundStyle(.secondary)
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
                        Knob(name: "Mouse pause", help: "Nothing is wiped while the mouse moves, clicks or drags (a finger and the Marker count too): the cleaning waits until it has rested this long. 0: only around the pointer.", value: $e.tune.mouse, range: 0...3000, step: 50, unit: " ms")
                        Switch(name: "Gentle clean", help: "Wipes through a grey checker instead of a black flash: softer on the eyes.", on: $e.tune.gentle)
                        Switch(name: "True greys when clean", help: "Pages that rest get real grey levels. Prettier, but the panel switches modes (a slower moment).", on: $e.tune.greys)
                        Switch(name: "Steady caret on the Mac", help: "macOS stops blinking the text caret while Sidecar runs, and blinks it again after. Apps read it when they open: reopen the one you type in. VS Code, Terminal and Chrome have their own setting.", on: $e.steadyCaret)
                        Switch(name: "Hold a blinking caret", help: "For the apps that still blink: the caret stays shown on paper instead of flipping (every flip leaves a little ghost).", on: $e.tune.blink)
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

                Form {
                    Section("Measure") {
                        Switch(name: "Profile", help: "The tablet watches its panel (when it starts moving, how long it moves, how busy it is) and both sides report every 2 s.", on: $e.profile)
                        HStack {
                            Button(e.recording == nil ? "Record to a file" : "Stop recording") { e.toggleRecord() }
                            if let u = e.recording { Button("Show in Finder") { NSWorkspace.shared.activateFileViewerSelecting([u]) }; Text(u.lastPathComponent).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    Section("Live") {
                        Line(title: "Mac", text: e.lines["frames"] ?? "")
                        Line(title: "Capture", text: e.lines["capture"] ?? "")
                        Line(title: "Panel", text: e.lines["panel"] ?? (e.profile ? "waiting for the tablet…" : "Profile off"))
                    }
                    Section("Panel timing") {
                        Switch(name: "Hold updates on moving pixels", help: "A pixel the panel is still driving ignores a new target and stays half-way: ghosts, doubled text, pink and yellow residue. Held, the update waits (merged with what follows) and goes out once the place rests.", on: $e.tune.hold)
                        Knob(name: "Pen update lasts", help: "How long the panel drives a fast update. Shorter: snappier, more ghosts. The profile's \"moves Pen\" says what your panel does.", value: $e.tune.holdPen, range: 0...2000, step: 25, unit: " ms")
                        Knob(name: "Grey update lasts", help: "The same for the true-grey and colour cleaning.", value: $e.tune.holdColour, range: 0...3000, step: 50, unit: " ms")
                        Knob(name: "Full refresh lasts", help: "Nothing is drawn until a full refresh is over.", value: $e.tune.holdFull, range: 0...5000, step: 100, unit: " ms")
                    }
                    Section("What the numbers mean") {
                        Text("""
                        Mac: pictures and rectangles sent per second, bytes after lz4, time to shade and compare a picture, time the tablet took to take it in.
                        Capture: how old a picture is when macOS hands it over, a pointer move to the tablet, cleans, scroll copies, pictures shaded on the GPU, what lz4 saved.
                        Panel: updates the tablet sent to the glass, updates held on moving pixels, how busy the panel was, how long it moved after a lone update of each kind, how soon it starts after one.
                        """).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .formStyle(.grouped).tabItem { Label("Profile", systemImage: "gauge.with.dots.needle.33percent") }
            }
            .padding([.horizontal, .bottom], 12)
            if !e.stats.isEmpty { Text(e.stats).font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary).padding(.bottom, 8) }
        }
        .frame(width: 600, height: 640)
    }
}
struct Line: View {
    let title: String, text: String
    var body: some View { VStack(alignment: .leading, spacing: 2) { Text(title).font(.caption.bold()); Text(text.isEmpty ? "–" : text).font(.system(size: 11, design: .monospaced)).textSelection(.enabled) } }
}
struct Gesture: View {
    let icon: String, text: String
    var body: some View { Label { Text(text) } icon: { Image(systemName: icon).frame(width: 24) } }
}

// --- the details window: everything the screen's engine measures, live
struct DetailsView: View {
    @ObservedObject var e: Engine
    var body: some View {
        let sections = e.details.reduce(into: [String]()) { if !$0.contains($1[0]) { $0.append($1[0]) } }
        VStack(spacing: 0) {
            if sections.isEmpty {
                Text(e.running ? "Waiting for the first measures…" : "Start Sidecar on a screen to see its details.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Form {
                    ForEach(sections, id: \.self) { s in
                        Section(s) {
                            ForEach(e.details.filter { $0[0] == s }, id: \.[1]) { r in
                                LabeledContent(r[1]) {
                                    Text(r[2]).monospacedDigit().textSelection(.enabled).multilineTextAlignment(.trailing)
                                        .foregroundStyle(r[2].hasPrefix("NOW:") ? .red : .primary)
                                }
                            }
                        }
                    }
                }
                .formStyle(.grouped)
            }
            HStack {
                Text("Measured over the last 2 s").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if e.testing { ProgressView().controlSize(.small) }
                Button(e.testing ? "Testing…" : "Speed test") { e.testing = true; e.send("speedtest") }
                    .disabled(e.testing || e.details.isEmpty)
                    .help("Measures the real throughput and latency to the screen's app on this connection (about 4 s; the picture pauses)")
                Button("Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(e.details.map { "\($0[0]) / \($0[1]): \($0[2])" }.joined(separator: "\n"), forType: .string)
                }
                .disabled(e.details.isEmpty)
            }
            .padding(12)
        }
        .frame(width: 520, height: 720)
    }
}

// --- the app: a menu bar item, no Dock icon
final class App: NSObject, NSApplicationDelegate {
    let engine = Engine()
    var item: NSStatusItem!, popover = NSPopover(), window: NSWindow?, detailsWindow: NSWindow?
    func applicationDidFinishLaunching(_ n: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "rectangle.portrait.on.rectangle.portrait.angled", accessibilityDescription: "Zinc Sidecar")
        item.button?.action = #selector(toggle); item.button?.target = self
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: PopoverView(e: engine, settings: { [weak self] in self?.settings() }, showDetails: { [weak self] in self?.details() }))
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
    func details() {
        popover.performClose(nil)
        if detailsWindow == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 720), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            w.title = "Zinc Sidecar: details"; w.isReleasedWhenClosed = false
            w.contentView = NSHostingView(rootView: DetailsView(e: engine)); w.center()
            detailsWindow = w
        }
        NSApp.activate(ignoringOtherApps: true); detailsWindow?.makeKeyAndOrderFront(nil)
    }
    func applicationWillTerminate(_ n: Notification) { if engine.running { engine.send("quit") }; Caret.restore() }
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
