import SwiftUI
import AppKit

let hostStart = DispatchTime.now().uptimeNanoseconds
func benchNow() -> Double { Double(DispatchTime.now().uptimeNanoseconds - hostStart) / 1000 }
let benchArguments = CommandLine.arguments
var benchFrames = 0
var benchWorkload = "active"
for (index, argument) in benchArguments.enumerated() {
    if argument == "--bench-frames" || argument == "--bench-workload" {
        guard index + 1 < benchArguments.count else { fputs("Missing benchmark argument\n", stderr); exit(2) }
        if argument == "--bench-frames" {
            guard let value = Int(benchArguments[index + 1]), (31...360).contains(value) else { fputs("bench frames must be 31...360\n", stderr); exit(2) }
            benchFrames = value
        } else {
            benchWorkload = benchArguments[index + 1]
            guard ["idle", "active"].contains(benchWorkload) else { fputs("bench workload must be idle or active\n", stderr); exit(2) }
        }
    }
}
if benchFrames > 0 { setenv("ZINC_BACKGROUND", "1", 1) }

final class ObservatoryModel: ObservableObject {
    @Published var speed = 1.0 { didSet { send() } }
    @Published var paused = false { didSet { send() } }
    @Published var selection = 0
    @Published var visible = true
    @Published var error = ""
    private var updating = false
    init() { if obs_start() != 0 { error = "Zinc could not start" } }
    func send() { if !updating { obs_controls(speed, paused ? 1 : 0, Int32(selection)) } }
    func select(_ id: Int) { selection = id; send() }
    func receive() { let id = Int(obs_selected()); if id != selection { updating = true; selection = id; updating = false } }
    deinit { obs_stop() }
}

final class ZincView: NSView {
    var model: ObservatoryModel
    var timer: Timer?
    var serial: UInt64 = 0
    var image: CGImage?
    var benchCount = 0
    var firstReady: Double?
    var previousTick: Double?
    var intervals: [Double] = []
    var ticks: [Double] = []
    var copies: [Double] = []
    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }
    init(model: ObservatoryModel) {
        self.model = model
        super.init(frame: .zero)
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override func layout() {
        super.layout()
        let scale = Int32(min(4, max(1, window?.backingScaleFactor ?? 1)))
        if bounds.width > 0 && bounds.height > 0 { _ = zn_embed_resize(Int32(bounds.width), Int32(bounds.height), scale); serial = 0 }
    }
    override func viewDidChangeBackingProperties() { super.viewDidChangeBackingProperties(); needsLayout = true }
    func tick() {
        let start = benchNow()
        var tickDuration = 0.0
        var copyDuration = 0.0
        defer {
            if benchFrames > 0 {
                benchCount += 1
                if benchCount > 30 {
                    if let previous = previousTick { intervals.append(start - previous) }
                    ticks.append(tickDuration); copies.append(copyDuration)
                }
                previousTick = start
                if benchCount == benchFrames {
                    guard let ready = firstReady else { fputs("No native image became ready\n", stderr); exit(1) }
                    let result: [String: Any] = ["schema": 1, "host": "swift-observatory", "workload": benchWorkload,
                        "warmup_frames": 30, "total_frames": benchCount, "first_ready_us": ready,
                        "clock_scope": "host_entry_to_native_image", "interval_us": intervals,
                        "tick_us": ticks, "copy_us": copies, "sample_count": ticks.count,
                        "timing_scope": "host wall durations; no GPU completion"]
                    let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
                    print("workflow bench json: " + String(data: data, encoding: .utf8)!); fflush(stdout)
                    timer?.invalidate(); obs_stop(); NSApp.terminate(nil)
                }
            }
        }
        zn_embed_pause(model.visible && window != nil ? 0 : 1)
        let tickStart = benchNow()
        if zn_embed_tick() < 0 {
            if benchFrames > 0 { fputs("Zinc stopped with an error\n", stderr); exit(1) }
            model.error = "Zinc stopped with an error"
        }
        tickDuration = benchNow() - tickStart
        model.receive()
        var frame = ZnEmbedFrame()
        guard zn_embed_frame(&frame) != 0, frame.serial != serial, let pixels = frame.pixels else { return }
        let copyStart = benchNow()
        serial = frame.serial
        // CGImage owns a copy so a later Zinc tick never mutates a pending draw.
        let data = Data(bytes: pixels, count: Int(frame.stride_bytes * frame.height)) as CFData
        if let provider = CGDataProvider(data: data) {
            image = CGImage(width: Int(frame.width), height: Int(frame.height), bitsPerComponent: 8, bitsPerPixel: 32,
                            bytesPerRow: Int(frame.stride_bytes), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue).union(.byteOrder32Little),
                            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        }
        copyDuration = benchNow() - copyStart
        if benchFrames > 0 && firstReady == nil && image != nil && window != nil {
            firstReady = benchNow(); print("workflow ready"); fflush(stdout)
        }
        needsDisplay = true
    }
    override func draw(_ dirtyRect: NSRect) {
        guard let image = image, let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState(); context.translateBy(x: 0, y: bounds.height); context.scaleBy(x: 1, y: -1)
        context.draw(image, in: bounds); context.restoreGState()
    }
    func pointer(_ event: NSEvent, _ kind: Int32) {
        let point = convert(event.locationInWindow, from: nil)
        var input = ZnEmbedEvent(); input.kind = kind; input.x = Float(point.x); input.y = Float(point.y)
        input.key = event.buttonNumber == 1 ? 2 : event.buttonNumber == 2 ? 1 : 0
        _ = zn_embed_event(&input)
    }
    override func mouseDown(with event: NSEvent) { window?.makeFirstResponder(self); pointer(event, 1) }
    override func mouseUp(with event: NSEvent) { pointer(event, 2) }
    override func mouseDragged(with event: NSEvent) { pointer(event, 0) }
    override func scrollWheel(with event: NSEvent) {
        var input = ZnEmbedEvent(); input.kind = 3; input.value = Float(event.scrollingDeltaY); input.x = Float(event.scrollingDeltaX)
        _ = zn_embed_event(&input)
    }
    override func keyDown(with event: NSEvent) {
        var input = ZnEmbedEvent(); input.kind = event.isARepeat ? 6 : 4
        input.key = event.keyCode == 48 ? 259 : Int32(event.charactersIgnoringModifiers?.lowercased().utf8.first ?? 0)
        _ = zn_embed_event(&input)
    }
    override func keyUp(with event: NSEvent) {
        var input = ZnEmbedEvent(); input.kind = 5
        input.key = event.keyCode == 48 ? 259 : Int32(event.charactersIgnoringModifiers?.lowercased().utf8.first ?? 0)
        _ = zn_embed_event(&input)
    }
    override func resignFirstResponder() -> Bool { var input = ZnEmbedEvent(); input.kind = 8; _ = zn_embed_event(&input); return true }
    deinit { timer?.invalidate() }
}
struct ZincRegion: NSViewRepresentable {
    let model: ObservatoryModel
    func makeNSView(context: Context) -> ZincView { ZincView(model: model) }
    func updateNSView(_ view: ZincView, context: Context) {}
}
struct ObservatoryContent: View {
    @ObservedObject var model: ObservatoryModel
    let names = ["Sun", "Earth", "Moon"]
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 20) {
                Text("Observatory").font(.title2.bold())
                Text("SWIFT + ZINC").font(.caption).foregroundStyle(.secondary)
                ForEach(0..<3) { id in Button(names[id]) { model.select(id) }.buttonStyle(.bordered) }
                Divider()
                Text("Orbital speed")
                Slider(value: $model.speed, in: 0...3).accessibilityLabel("Orbital speed")
                Toggle("Pause simulation", isOn: $model.paused)
                Toggle("Show Zinc region", isOn: $model.visible)
                Spacer()
                Text("Selected: \(names[model.selection])").font(.headline)
                Text("Native controls.\nOne embedded Zinc surface.").font(.caption).foregroundStyle(.secondary)
            }.padding(24).frame(width: 220)
            Divider()
            ZStack { Color(red: 0.06, green: 0.1, blue: 0.18); ZincRegion(model: model).opacity(model.visible ? 1 : 0) }
            if !model.error.isEmpty { Text(model.error).foregroundStyle(.red) }
        }.frame(minWidth: 900, minHeight: 560).background(Color(nsColor: .windowBackgroundColor))
    }
}
final class Delegate: NSObject, NSApplicationDelegate {
    var window: NSWindow?
    var model: ObservatoryModel?
    func applicationDidFinishLaunching(_ notification: Notification) {
        let model = ObservatoryModel(); self.model = model
        if benchFrames > 0 {
            if !model.error.isEmpty { fputs("Zinc could not start\n", stderr); exit(1) }
            model.paused = benchWorkload == "idle"
        }
        let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 1100, height: 680),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Native Observatory — Swift × Zinc"
        window.contentView = NSHostingView(rootView: ObservatoryContent(model: model))
        window.center(); window.orderBack(nil); self.window = window
        if ProcessInfo.processInfo.environment["ZINC_BACKGROUND"] != "1" { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        if CommandLine.arguments.contains("--smoke") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.smoke() }
        }
    }
    func smoke() {
        guard let window = window, let model = model, let content = window.contentView else { fatalError("Missing native content") }
        func find(_ node: NSView) -> ZincView? {
            if let zinc = node as? ZincView { return zinc }
            for child in node.subviews { if let zinc = find(child) { return zinc } }
            return nil
        }
        guard let region = find(content) else { fatalError("No embedded Zinc region") }
        precondition(NSApp.windows.filter { $0.isVisible }.count == 1 && obs_has_external_window() == 0)
        model.paused = true; model.speed = 2.0; model.select(2); region.tick()
        precondition(obs_selected() == 2)
        var frame = ZnEmbedFrame(); _ = zn_embed_frame(&frame)
        let serial = frame.serial; region.tick(); _ = zn_embed_frame(&frame)
        precondition(frame.serial == serial, "Paused scene redrew")
        window.setContentSize(NSSize(width: 1180, height: 720)); content.layoutSubtreeIfNeeded(); region.layout(); region.tick()
        _ = zn_embed_frame(&frame)
        precondition(frame.width == Int32(region.bounds.width) * Int32(window.backingScaleFactor))
        // Explicit Retina contract independent of the attached screen's actual density.
        _ = zn_embed_resize(640, 480, 2); region.tick(); _ = zn_embed_frame(&frame)
        precondition(frame.width == 1280 && frame.height == 960)
        region.layout(); region.tick()
        window.makeFirstResponder(region)
        let tab = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: window.windowNumber, context: nil, characters: "\t", charactersIgnoringModifiers: "\t", isARepeat: false, keyCode: 48)!
        region.keyDown(with: tab); region.tick(); precondition(model.selection == 0)
        model.select(1); region.tick()
        let point = region.convert(NSPoint(x: region.bounds.width / 2, y: region.bounds.height / 2), to: nil)
        for kind in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            let event = NSEvent.mouseEvent(with: kind, location: point, modifierFlags: [], timestamp: 0, windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!
            if kind == .leftMouseDown { region.mouseDown(with: event) } else { region.mouseUp(with: event) }
            region.tick()
        }
        precondition(model.selection == 0, "Zinc pointer selection did not reach Swift")
        model.visible = false; region.tick(); _ = zn_embed_frame(&frame); let hidden = frame.serial
        region.tick(); _ = zn_embed_frame(&frame); precondition(frame.serial == hidden)
        model.visible = true; model.paused = false; region.tick()
        if let index = CommandLine.arguments.firstIndex(of: "--capture"), index + 1 < CommandLine.arguments.count {
            content.displayIfNeeded()
            guard let rep = content.bitmapImageRepForCachingDisplay(in: content.bounds) else { fatalError("Capture failed") }
            content.cacheDisplay(in: content.bounds, to: rep)
            try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[index + 1]))
        }
        obs_stop(); obs_stop()
        print("observatory: native window, two-way selection, resize, Retina, focus, hide/show, shutdown passed")
        NSApp.terminate(nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { obs_stop() }
}
let application = NSApplication.shared
let delegate = Delegate(); application.delegate = delegate
application.setActivationPolicy(ProcessInfo.processInfo.environment["ZINC_BACKGROUND"] == "1" ? .accessory : .regular)
application.run()
