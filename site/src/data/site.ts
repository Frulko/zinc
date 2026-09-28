export const img = (f: string) => `${import.meta.env.BASE_URL}docs-assets/img/${f}`;

export const shots = [
  { f: 'pinball-playing.png', t: 'Nova Patrol', d: 'Space pinball, pseudo-3D table, 960 Hz swept physics, missions, multiball.', cmd: 'examples/pinball', tag: 'game' },
  { f: 'zed-editor.png', t: 'Zed-style code editor', d: 'Project tree, tabs, highlighting, minimap, ⌘P / ⌘⇧P, find. Written in Zinc.', cmd: 'examples/zed-editor', tag: 'app' },
  { f: 'hero.png', t: 'Hero', d: 'Full app: intro, 5 screens, transitions, gallery → detail, physics, ⌘K palette.', cmd: 'examples/hero', tag: 'app' },
  { f: 'kit-gallery.png', t: 'UI kit, light', d: 'shadcn-style components, identical under Solid and React.', cmd: 'examples/ui/kit-gallery', tag: 'app' },
  { f: 'kit-gallery-dark.png', t: 'UI kit, dark', d: 'Same code, dark theme.', cmd: 'examples/ui/kit-gallery', tag: 'app' },
  { f: 'breakout-demo.png', t: 'Breakout', d: 'Arrows, mouse or touch. The same source runs on 9 targets.', cmd: 'examples/breakout', tag: 'game' },
  { f: 'map-explorer.png', t: 'Offline vector map', d: 'Paris, pan / zoom / pinch, OpenStreetMap tiles.', cmd: 'examples/maps/explorer', tag: 'app' },
  { f: 'navigation-night.png', t: 'Turn-by-turn navigation', d: 'Waze-style drive through Paris, heading-up camera, fully offline.', cmd: 'examples/maps/navigation', tag: 'app' },
  { f: '3d-model.png', t: '3D model viewer', d: 'Software 3D: OBJ, Gouraud, perspective-correct textures, z-buffer.', cmd: 'examples/3d/model', tag: '3d' },
  { f: 'video-mapper.png', t: 'GPU video mapping', d: 'Corner pin, mesh warp, masks, edge blend, driven by OSC + web companion.', cmd: 'examples/video/mapper', tag: 'video' },
  { f: 'video-looper.png', t: 'Gapless video looper', d: 'FFmpeg with hardware decode, gapless playlists.', cmd: 'examples/video/looper', tag: 'video' },
  { f: 'remarkable-notes.png', t: 'reMarkable Paper Pro', d: 'Handwriting notebook on e-ink, pen API, `zinc deploy` over ssh.', cmd: 'examples/remarkable/notes', tag: 'device' },
  { f: 'esp32-2432s022-home.png', t: 'ESP32 touch LCD', d: '2.2" board with 160 KiB of heap running a full touch UI.', cmd: 'examples/boards/esp32-2432s022', tag: 'device' },
  { f: 'iot-panel.png', t: 'IoT panel', d: 'GPIO simulator, live chart, telemetry, OSC.', cmd: 'examples/iot-panel', tag: 'device' },
  { f: 'pocket-hero.png', t: 'PocketJS Hero, unchanged', d: 'An existing PocketJS app compiled as is — no JS engine.', cmd: 'examples/pocket-hero', tag: 'app' },
  { f: 'script-playground.png', t: 'Sandboxed scripting', d: 'QuickJS-ng with typed host functions, limits and game mods.', cmd: 'examples/scripting', tag: 'app' },
  { f: 'camera-remote.png', t: 'Camera remote', d: 'gphoto2 remote control with live view.', cmd: 'examples/camera/remote', tag: 'device' },
  { f: 'chataigne.png', t: 'Show-control companion', d: 'Chataigne companion over OSC.', cmd: 'examples/chataigne', tag: 'app' },
  { f: 'svg-gallery.png', t: 'Runtime SVG', d: 'Vector graphics rendered by the shared rasterizer.', cmd: 'examples/ui', tag: '3d' },
  { f: 'lottie-gallery.png', t: 'Lottie animations', d: 'Checked against lottie-web on 12 files, down to the ESP32.', cmd: 'examples/ui/lottie-gallery', tag: '3d' },
  { f: 'inferno-todo.png', t: 'Inferno todo', d: 'Solid, React, Inferno and PocketJS all supported.', cmd: 'examples/inferno-todo', tag: 'app' },
];

export const targets = [
  { id: 'macos', out: 'Native executable', screen: 'SDL3 window', note: 'Development host, emulators for every display plugin', state: 'ok' },
  { id: 'linux', out: 'Executable (Docker)', screen: 'fbdev / GL', note: 'GCC in zinc/sdk-linux', state: 'ok' },
  { id: 'rpi1', out: 'ARMv6 hard-float', screen: 'fbdev, GL, SSD1306, WS2812', note: 'Also runs on Pi 2/3/4 (32-bit); tested under QEMU', state: 'ok' },
  { id: 'rmpp', out: 'Static aarch64', screen: 'E-ink (qtfb)', note: 'reMarkable Paper Pro, pen API, zinc deploy', state: 'ok' },
  { id: 'esp32', out: 'ESP-IDF firmware', screen: 'WS2812, SSD1306, ST7789', note: 'f32 numbers, 160 KiB heap; tested in Espressif QEMU', state: 'ok' },
  { id: 'wasm', out: 'Emscripten page', screen: 'Canvas', note: 'zinc run --target wasm serves it', state: 'ok' },
  { id: 'ps1', out: 'PS-EXE + CD image', screen: 'GPU VRAM bands', note: 'Q20.12 fixed point, no FPU; tested in PCSX-Redux', state: 'ok' },
  { id: 'ps2', out: 'EE ELF', screen: 'gsKit', note: 'Build only (PCSX2 needs your BIOS)', state: 'warn' },
  { id: 'sim', out: 'Node.js', screen: 'headless', note: 'The oracle every target is compared with', state: 'ok' },
];

export const caps = {
  cols: ['heap', 'numbers', 'touch', 'pointer', 'keyboard', 'pen', 'gamepad', 'e-ink', 'net', 'fs', 'threads'],
  rows: [
    ['macos / linux', '512M', 'f64', '–/opt', 'yes', 'yes', 'opt', 'opt', '–', 'yes', 'yes', 'yes'],
    ['rpi1', '64M', 'f64', 'opt', 'opt', 'opt', '–', 'opt', '–', 'yes', 'yes', 'yes'],
    ['rmpp', '256M', 'f64', 'yes', '–', 'opt', 'yes', '–', 'yes', 'yes', 'yes', 'yes'],
    ['esp32', '160K', 'f32', 'plugin', '–', '–', '–', '–', 'plugin', 'yes', 'yes', '–'],
    ['ps1', '256K', 'fx12', '–', '–', '–', '–', 'yes', '–', '–', '–', '–'],
    ['ps2', '16M', 'f32', '–', '–', '–', '–', 'yes', '–', '–', '–', '–'],
    ['wasm', '64M', 'f64', 'opt', 'yes', 'yes', 'opt', 'opt', '–', '–', '–', '–'],
  ],
};

// tests/bench via docs/reports/PERF.md — Apple M1 Pro, median of 5 runs
export const bench = [
  ['nbody', 80.4], ['spectralnorm', 79.3], ['mandelbrot', 32.9], ['fannkuch', 20.9], ['fib', 16.4],
  ['mapset', 10.1], ['binarytrees', 8.2], ['sort', 5.4], ['jsonout', 2.2], ['strings', 2.1],
] as [string, number][];

export const benchFull = [
  ['binarytrees', 13.3, 33.5, 57.0, 108.5],
  ['fannkuchredux', 369.6, 294.9, 273.5, 7740.8],
  ['fib', 14.7, 48.9, 69.0, 240.1],
  ['jsonout', 2.1, 27.9, 50.0, 4.7],
  ['mandelbrot', 21.1, 49.0, 72.9, 694.3],
  ['mapset', 10.0, 45.7, 68.2, 100.9],
  ['nbody', 33.8, 328.1, 355.1, 2716.3],
  ['sort', 155.8, 516.0, 667.1, 835.2],
  ['spectralnorm', 54.3, 104.6, 113.9, 4306.4],
  ['strings', 27.4, 58.5, 83.4, 57.2],
] as [string, number, number, number, number][];

export const features = [
  { i: '⚡', t: 'No JS engine, ever', d: 'TypeScript is compiled to C++17. Binaries are ~70 KiB, start in 2 ms and idle at ~1.3 MiB RSS.' },
  { i: '🎯', t: 'One oracle, byte for byte', d: 'The sim target runs your program on Node. `zinc test` checks every target prints exactly the same bytes.' },
  { i: '🧱', t: 'Real machine types', d: '`i32`, `u8`, `f32`, `fx12`… Fixed point is bit-identical with the oracle, so a PS1 and a Mac agree.' },
  { i: '🧠', t: 'Deterministic memory', d: 'Reference counting (RAII), arenas, pools, weak refs and a TLSF heap. ASan + UBSan leak report in `--debug`.' },
  { i: '🖼️', t: 'Declarative UI in JSX', d: 'Flexbox, Tailwind-like classes, CSS imports, animations, virtual lists — with Solid signals or React hooks.' },
  { i: '🎨', t: 'Shared 2D rasterizer', d: 'AA shapes, gradients, shadows, paths, TTF text, damage-rect diffing. Identical pixels from Retina to a 2.2" LCD.' },
  { i: '🔥', t: 'Hot reload and inspector', d: '`zinc dev` reloads in ~0.5–1.2 s, shows a red box on crash and exposes a Chrome DevTools UI inspector.' },
  { i: '🔌', t: 'Plugins compiled on demand', d: 'Video, maps, SVG, Lottie, 3D, three.js-style API, canvas 2D, webview, sandboxed scripts. Pay only for what you import.' },
  { i: '📡', t: 'Headless services too', d: 'HTTP server, MQTT, OSC, GPIO, telemetry, systemd units. Same language from firmware to daemon.' },
  { i: '🧩', t: 'Native modules', d: 'Write a typed spec, get a generated C++ interface and one implementation per target.' },
  { i: '📋', t: 'Capabilities, not surprises', d: 'Apps declare `requires: ["heap>=4M", "pointer|touch"]`; the build tells you why a target does not fit.' },
  { i: '📦', t: 'One-command shipping', d: '`zinc export` and `zinc deploy` produce a single executable with embedded assets, scripts and a systemd unit.' },
];

export const forbidden = [
  ['var, arguments, eval, with', 'Z1001–Z1005', 'no runtime metaprogramming'],
  ['regex literals', 'Z1008', 'no regex engine on the device'],
  ['dynamic import(), globalThis, prototype mutation', 'Z1009 / Z1015 / Z1010', 'closed world'],
  ['holey arrays', 'Z1011', 'arrays are dense'],
  ['any / unknown without narrowing (strict)', 'Z1006 / Z1016', 'gradual Dyn exists outside strict profiles'],
  ['float on FPU-less targets', 'Z4001', 'use fx12 / i32, or --no-float'],
  ['rest params, labeled statements', 'Z9009 / Z9011', 'not implemented yet'],
  ['finally in async, await in loop condition', 'Z9034 / ADR 0007', 'not implemented yet'],
];
