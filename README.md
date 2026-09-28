# Zinc (prototype)

Zinc compiles a strict subset of TypeScript to native C++17 — no JavaScript engine on the device — and links it
with a small runtime (`zrt`, no STL/exceptions/RTTI) and one hardware layer per target. Memory is reference counted
(plus arenas, pools, weak refs, TLSF heap). The `sim` target runs the same program on Node.js and is the oracle:
every target must print exactly the same bytes (`zinc test` checks it).

**TS → C++ → native binary.** Node.js only runs the compiler (written in TypeScript) and the sim oracle;
the executables Zinc produces do not need Node.

Status and what is missing: **[docs/reports/STATUS.md](docs/reports/STATUS.md)**. Performance vs QuickJS (the engine under PocketJS) and Node: **[docs/reports/PERF.md](docs/reports/PERF.md)** — about 13× faster than QuickJS (geometric mean of 10 kernels, 2× to 80×; Node.js wins fannkuch), 70 KiB binaries, 2 ms startup.

## Requirements

- Node.js ≥ 23.6 and pnpm (`pnpm install`)
- CMake ≥ 3.20 and a C++17 compiler (Apple Clang or GCC)
- SDL3 for windowed programs on macOS (`brew install sdl3`)
- Docker for cross targets (`linux`, `rpi1`, `ps1`, `ps2`, `esp32`); emscripten for `wasm` (`brew install emscripten`)

```sh
pnpm install
alias zinc="node $PWD/compiler/bin/zinc.mjs"
zinc doctor
```

## Try it

```sh
zinc run examples/breakout                 # game (arrows/A-D/mouse, Space), SDL3 window
zinc run examples/hero                     # full app: intro, 5 screens, transitions, gallery → detail, physics, ⌘K palette
zinc run examples/zed-editor               # Zed-style code editor: project tree, tabs, highlighting, minimap, ⌘P / ⌘⇧P, find
zinc run examples/text/src/main-react.tsx      # same screen as main-solid.tsx, React model
zinc run examples/iot-panel                # GPIO simulator, live chart, telemetry, OSC (X = button)
zinc run examples/lang --target sim        # language tour on Node (the oracle)
zinc run examples/breakout --target wasm   # browser: http://localhost:8080
zinc run examples/breakout --profile ps1   # macOS window emulating the PS1 profile (Q20.12 fixed point, 320x240, 256 KiB heap)
zinc run examples/lang --target rpi1       # ARMv6 hard-float binary under QEMU (arm1176)
zinc run examples/hello --target esp32     # ESP-IDF firmware in Espressif's QEMU
zinc run examples/hello --target ps1       # PS-EXE + CD image (PSn00bSDK), run in PCSX-Redux (built-in OpenBIOS)
zinc build examples/breakout --target ps2  # PS2 EE ELF (ps2dev + gsKit), run it in PCSX2 with your BIOS
zinc test [--target rpi1|linux|ps1|esp32] [--profile ps1]   # conformance: sim oracle vs target, byte for byte

zinc run examples/pocket-hero              # the PocketJS Hero demo (Hero.tsx unchanged), no JS engine
zinc run examples/video/looper -- --path examples/video/looper/media   # gapless video looper (videolooper.de style)
zinc run examples/video/mapper             # GPU video mapping driven by OSC + web companion
zinc run examples/maps/explorer            # offline vector map of Paris (pan, zoom, pinch)
ZINC_FAKE_CAMERA=1 zinc run examples/camera/remote   # gphoto2 remote with live view
zinc run examples/led/scroll-text          # WS2812 LED matrix emulator; --target esp32 for the real one
zinc run examples/remarkable/notes         # reMarkable Paper Pro notebook in the e-ink emulator
zinc run apps/studio                       # ZincStudio: node-based editor (Choregraphe-style), build/run/preview/deploy
zinc run examples/ui/kit-gallery           # shadcn-style component kit (zinc:ui/kit), light and dark
zinc run examples/ui/keyboard              # on-screen keyboard for touch screens: 9 languages, accents, digit pads
ZINC_CHATAIGNE_SIM=1 zinc run examples/chataigne   # show-control companion for Chataigne over OSC (built-in simulator)
zinc run examples/three/gltf-viewer        # three.js-style API: glTF model, orbit controls, picking
zinc run examples/canvas/sketch            # HTML Canvas 2D-style API (clock, fireworks)
zinc run examples/boards/s3-matrix/tilt-sand   # ESP32-S3 Matrix demo in the LED emulator (IMU with arrow keys)
zinc flash examples/boards/s3-matrix/tilt-sand --target esp32   # flash the real board (host esptool)

zinc init mygame --template game|cli|server|iot|remarkable
zinc dev                                   # hot reload on save, red box on crash, UI inspector on :9229
zinc plugins                               # the plugin toolbox and where each plugin runs
zinc export --target macos|linux|rpi1|rmpp # dist/<name>-<target>: single executable (assets embedded), scripts, systemd unit
zinc deploy --target rpi1|rmpp --device user@host   # export, copy over ssh, start
ZINC_TELEMETRY=udp://127.0.0.1:9999 zinc run examples/iot-panel & zinc monitor
```

Windows: UI apps follow the window size (responsive layouts, `sm:`/`md:`/`lg:`/`xl:` classes, live resize), games keep
a fixed surface and scale it; `zinc.json` `targets.macos` takes `zoom`, `resize` (`fill`/`letterbox`), `fullscreen` and
`kiosk` (fullscreen, no cursor, always on top, no quit shortcuts), also as `ZINC_*` variables; F11 toggles fullscreen.

Debug builds (`--debug`) use ASan + UBSan and print a leak report. `ZINC_FRAMES=n` stops a frame loop after n frames,
`ZINC_SHOT=out.png` saves the last frame (`zinc capture app --frames 1,60` saves any frames, `zinc test --pixels`
compares them with golden PNGs), `ZINC_DETERMINISTIC=1` runs on a virtual clock
([determinism](docs/guide/06-testing.md#determinism)), `ZINC_LOG_FORMAT=json` switches console output to JSON lines.

## Documentation

- **Developer guide**: [docs/guide/](docs/guide/README.md) — getting started, language, UI apps, headless services,
  plugins, testing, distribution (app bundles, icons, signing), security and obfuscation.
- **UI kit**: [docs/ui-kit.md](docs/ui-kit.md); **UI input and events**: [docs/ui.md](docs/ui.md).
- **ZincStudio**: [docs/studio.md](docs/studio.md); **boards** (ESP32-S3 Matrix, ESP32-2432S022 2.2" touch LCD, Scroll pHAT): [docs/boards.md](docs/boards.md).
- **Architecture overview** (French): https://claude.ai/artifact/EJAZtwX2HRPtYYBjfypThU

## What the language covers

Classes (inheritance, abstract, statics, accessors, `#private`), interfaces, generics (C++ templates), closures,
enums, discriminated unions, tuples, destructuring, spread, `?.`/`??`/`??=`, `try/catch/finally` (status returns, no C++
exceptions), `using`, `async/await` and generators (stackless frames), machine types (`i32`, `u8`, `f32`, `fx12`…),
strings (UTF-8 storage, UTF-16 indices), arrays, `Map`/`Set`, JSON output, `console.*` with levels. Forbidden constructs
(`eval`, `var`, `any` in strict profile, regex, prototype mutation…) are `Z1xxx` diagnostics.

## Targets

| Target | Output | Screen | Notes |
| --- | --- | --- | --- |
| `macos` | native executable | SDL3 window | development host, emulators for every display plugin |
| `linux` | executable (docker `zinc/sdk-linux`) | fbdev / GL plugins | |
| `rpi1` | ARMv6 hard-float (docker, QEMU for tests) | fbdev, GL (Pi 3+), SSD1306, WS2812 | also runs on Pi 2/3/4 32-bit |
| `rmpp` | static aarch64 (docker `zinc/sdk-rmpp`) | e-ink via AppLoad qtfb | reMarkable Paper Pro, pen API, `zinc deploy` |
| `esp32` | ESP-IDF firmware (Espressif QEMU for tests) | WS2812, SSD1306, ST7789 | f32 numbers, 160 KiB heap |
| `wasm` | emscripten page | canvas | `zinc run --target wasm` serves it |
| `ps2` | EE ELF (ps2dev) | gsKit | build only (PCSX2 needs your BIOS) |
| `ps1` | PS-EXE + CD image (PSn00bSDK) | GPU VRAM upload of damaged bands | fixed point Q20.12, tests run in PCSX-Redux |
| `sim` | Node.js | headless | the oracle every target is compared with |

## Modules

| Import | What |
| --- | --- |
| `zinc:gfx` | immediate 2D on a shared software rasterizer: AA shapes, gradients, shadows, strokes, paths, baked TTF text, images, runtime images, render-to-image, damage-rect frame diff, multitouch/pen input |
| `zinc:ui`, `zinc:ui/solid`, `zinc:ui/react` | declarative UI with JSX (`.tsx`): flexbox, Tailwind-like classes, CSS imports, engine animations, scroll views and virtual lists, Solid signals (keyed `<For>`) or React hooks (reconciled) |
| `@pocketjs/framework/*`, `solid-js` | PocketJS compatibility: PocketJS apps compile unchanged |
| `zinc:sys`, `zinc:fs`, `zinc:storage`, `zinc:assets` | process, files, key/value store, assets embedded in the executable |
| `zinc:net` | `fetch` (libcurl) and a small HTTP server (server mode) |
| `zinc:osc`, `zinc:mqtt` | OSC over UDP, MQTT 3.1.1 client |
| `zinc:telemetry` | JSON-lines telemetry (perf, logs, metrics, exposed state) to UDP/stdout/file |
| `zinc:gpio`, `zinc:events` | pins (simulator on hosts, libgpiod on Pi, driver/gpio on ESP32), typed event channels |
| `native/<name>.spec.ts` | your own native module: typed spec → generated C++ interface, one implementation per target |

## Plugins

Optional features live in `plugins/` and are compiled in only when a program imports them (or selects a display
driver in `zinc.json`); `zinc plugins` lists them with their targets. See [docs/plugins.md](docs/plugins.md).

| Plugin | What | Guide |
| --- | --- | --- |
| `zinc:video` | FFmpeg playback with hardware decode, gapless playlists | [video](docs/plugins/video.md) |
| `zinc:mapping` + display `gl` | GPU video mapping: corner pin, mesh warp, masks, edge blend, OSC + web companion | [mapping](docs/plugins/mapping.md), [display-gl](docs/plugins/display-gl.md) |
| `zinc:map`, `zinc:svg`, `zinc:gestures` | vector-tile maps (OpenStreetMap), runtime SVG, gestures | [map](docs/plugins/map.md), [svg](docs/plugins/svg.md) |
| `zinc:gphoto2` | camera remote control and live view | [gphoto2](docs/plugins/gphoto2.md) |
| `zinc:ink` + display `rmpp` | handwriting, reMarkable Paper Pro screen | [rmpp](docs/targets/remarkable-paper-pro.md) |
| displays `fbdev`, `ws2812`, `ssd1306`, `st7789`, `zinc:pixelfont` | screens for Pi and ESP32, LED matrices | [displays](docs/plugins/displays.md), [fbdev](docs/plugins/display-fbdev.md) |
| `zinc:devtools` | UI inspector over the Chrome DevTools protocol | [dev mode](docs/dev-mode.md) |
| `zinc:canvas`, `three` | HTML Canvas 2D-style API; three.js-style scenes, GLTFLoader, OrbitControls | [canvas2d](docs/plugins/canvas2d.md), [three](docs/plugins/three.md) |
| `zinc:process`, `zinc:remote` + display `remote`, `zinc:webview` | child processes; live remote screens with input; native webview (Tauri-like) | [process](docs/plugins/process.md), [remote](docs/plugins/remote.md), [webview](docs/plugins/webview.md) |
| `zinc:imu`, `zinc:device`, display `scrollphat` | QMI8658 motion sensor; backlight and device figures; Pimoroni Scroll pHAT | [boards](docs/boards.md) |

## Layout

```
compiler/src   frontend (TS 6 API) · sema · jsx/css lowering · emit-cpp · emit-js · native modules · plugins · resources · cli · tools
lib/           zinc.d.ts, gfx.d.ts, modules.d.ts, std/ (ui, solid, react — written in Zinc), compat/pocketjs, fonts/
runtime/       zrt.h/.cpp (+ zrt_ext.h), raster/gfx (software renderer), host.cpp, dev_host.cpp, mod/ (built-in modules), hal.h
targets/       HALs: macos (SDL3), null, common POSIX, wasm, ps1, ps2, esp32
plugins/       optional features and display drivers (one directory each, plugin.json)
sim/           Node shim + sim implementations of the modules
docker/        SDK images: linux, rpi1, rmpp, psx (PSn00bSDK + PCSX-Redux), ps2
tests/         conformance programs and expected outputs (.out per number representation / resolution), benchmarks
examples/      basics (hello, lang, breakout…), pocket-hero, video/, maps/, camera/, led/, remarkable/, native-module
docs/          status, performance, decisions, plugins, targets, dev mode, licenses
```
