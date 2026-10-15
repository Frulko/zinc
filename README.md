# Zinc

Zinc makes desktop and mobile apps the way Electron does, without shipping a browser. A program is written in a strict, typed subset of
TypeScript (with JSX), and the same program runs on a Mac, a Linux PC, a Raspberry Pi, an ESP32, a reMarkable, an HP TouchPad, a
console or a web page. The accent is on the UI, on speed and on modest hardware; 3D, sound, video and games complete it. It is made for
education, makers, artists and DIY.

The repository holds two generations:

- **Zinc Next** (`next/`, C++20) is the engine all current work goes into: a typed IR, a bytecode interpreter, compilation ahead of time
  to C++, a QuickJS engine for plain JavaScript, a GPU renderer and the toolchain that builds for every target.
- **The prototype** (`compiler/`, `runtime/`, `sim/`) compiles the subset to C++17 on Node. It is the specification Next must match,
  demo for demo: [docs/prototype.md](docs/prototype.md).

## Quick start

```sh
curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh   # macOS and Linux, no compiler needed
zinc doctor                         # what this machine has: engine, renderer, toolchains, plugins
zinc new desktop-app my-app && cd my-app && zinc run
```

From the sources (Windows, or to work on Zinc): CMake 3.20+ and a C++20 compiler, nothing else; the libraries are vendored.

```sh
cd next && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && tools/build zinc
build/zinc run ../examples/hero
```

The walk from install to a first app: [docs/guide/01-getting-started.md](docs/guide/01-getting-started.md).

## What Zinc Next brings

- **Three engines, one program.** `zinc run` interprets the bytecode (instant start, hot reload), `zinc build` compiles it ahead of time
  to a native executable, and `--engine quickjs` runs plain JavaScript libraries (three.js, PixiJS, Phaser) on QuickJS-ng.
- **Cross builds without Docker.** `zinc build --target T` uses a pinned zig toolchain that `zinc toolchain` downloads: `aarch64-linux`
  (Pi 3/4/5, reMarkable Paper Pro), `armhf-linux` (every Pi), `armv7-linux` (NTC CHIP), `armv7-webos` (HP TouchPad), `x86_64-linux`,
  `aarch64-macos`, `x86_64-macos`, `x86_64-windows` (console programs); `--target esp32` flashes a board or runs Espressif's QEMU.
- **A GPU renderer** behind the UI (OpenGL, GLES 2 down to the Pi's VideoCore IV and the TouchPad's Adreno 220), with a software
  rasterizer where there is no GPU, and WebGL 1/2 for the JavaScript engines.
- **UI in the styles people know**: Solid or React models, Tailwind-like classes, a shadcn-style kit, Nuxt UI 4 and React Native
  components (`examples/nuxt-ui`, `examples/rn-showcase`).
- **Web APIs on every device**: `fetch`, WebSocket, `crypto.subtle`, `localStorage`, and the device APIs (battery, sensors, vibration,
  wake lock, screen orientation, notifications, network) backed by each target; `zinc run --simulate hp-touchpad` gives a desktop
  program a device's screen, sensors and panel ([docs/guide/09-web-apis.md](docs/guide/09-web-apis.md)).
- **Tools**: `zinc dev` (hot reload, Chrome DevTools inspector), `zinc debug` (DAP and CDP debugger), `zinc lsp`, `zinc test`,
  `zinc capture`, `zinc bench`, `zinc explain` for every error code.
- **Shipping**: `zinc export` and `zinc pack` (macOS .app, single executables, `.zapp` fused apps), asset packs per target,
  `zinc publish` and signed updates, a signed plugin index (`zinc add`, `zinc trust`).
- **Devices**: `zinc agent` makes a Linux or macOS machine a device, and `zinc device` drives it from the workstation (shell, files,
  apps, logs, ports), as adb does over the network.

## Demos

```sh
zinc run examples/hero               # a complete app: intro, screens, transitions, gallery, physics, command palette
zinc run examples/nuxt-ui            # Nuxt UI 4 components
zinc run examples/rn-showcase        # React Native components and APIs
zinc run examples/zed-editor         # a Zed-style code editor
zinc run examples/three/gltf-viewer  # three.js API: a glTF model, orbit controls
zinc run examples/maps/explorer      # offline vector map, pan, zoom, pinch
zinc run examples/pinball            # pinball: 960 Hz physics, missions, multiball
zinc run examples/leapmotion         # hand tracking games (Ultraleap, or simulated)
zinc run examples/hardware           # the device web APIs on one screen (try --simulate hp-touchpad)
zinc run examples/music              # a Sonos and Spotify remote; examples/music/install.sh puts it on an HP TouchPad
```

## Plugins

Optional features live in `plugins/`, one directory each, and are compiled into a program only when it imports them (or names a display
driver in `zinc.json`); `zinc plugins` lists them with their targets ([docs/plugins.md](docs/plugins.md), guides in
[docs/plugins/](docs/plugins/)). **Native** plugins hold C/C++ code or a library; **Zinc** ones are written in Zinc and run wherever the
modules they use do. Platforms are those each `plugin.json` declares. Abbreviations: Pi = Raspberry Pi, rM = reMarkable Paper Pro,
Web = WebAssembly.

### Modules

| Plugin | What it does | Code | Platforms |
|---|---|---|---|
| `zinc:3d` | 3D: meshes, materials, lights, camera, scene graph; software or GPU | Native | macOS, Linux, Pi, ESP32, Web |
| `three` | three.js API subset on `zinc:3d` (GLTFLoader, OrbitControls) | Native | macOS, Linux, Pi, Web |
| `zinc:canvas` | HTML Canvas 2D-style context | Native | macOS, Linux, Pi, rM, Web, ESP32 |
| `zinc:svg` | SVG rendered at run time | Native | macOS, Linux, Pi, Web |
| `zinc:lottie` | Lottie animations, `<Lottie/>` | Native | macOS, Linux, Pi, rM, Web, PS2, ESP32 |
| `zinc:map` | Vector maps (Mapbox tiles, MapLibre styles) | Native | macOS, Linux, Pi |
| `zinc:mapping` | GPU video mapping (warp, masks, blends) driven by OSC | Native | macOS, Pi |
| `zinc:video` | Video: FFmpeg (VideoToolbox, V4L2), GStreamer and the hardware decoder on webOS | Native | macOS, Linux, Pi, webOS |
| `zinc:audio` | Sounds and music (WAV, FLAC, MP3, Ogg) on miniaudio | Native | macOS, Linux |
| `zinc:midi` | MIDI in and out (RtMidi) | Native | macOS, Linux |
| `zinc:osc/full` | Open Sound Control over UDP | Zinc | macOS, Linux, Pi, rM |
| `zinc:physics2d` | 2D physics (Box2D 3.1) | Native | macOS, Linux |
| `zinc:physics3d` | 3D physics (Jolt 5.6) | Native | macOS, Linux |
| `zinc:gestures` | Pan, pinch, rotate, tap | Zinc | macOS, Linux, Pi, Web, ESP32, PS2 |
| `zinc:ink` | Handwriting: pressure, eraser, SVG/JSON export | Zinc | macOS, Linux, Pi, Web, rM |
| `zinc:sprite` | Sprite animations from packed atlases | Zinc | macOS, Linux, Pi, Web, ESP32, PS2 |
| `zinc:tilemap` | Tiled and LDtk levels | Zinc | macOS, Linux, Pi, Web, ESP32, PS2 |
| `zinc:pixelfont` | 5x7 and 3x5 bitmap fonts for LED matrices | Zinc | macOS, Linux, Pi, ESP32, Web, PS2 |
| `zinc:loader` | Loading screens (bar, splash, `<Loader>`) | Zinc | macOS, Linux, Pi, Web, ESP32, PS2 |
| `zinc:sqlite` | SQLite 3.53 databases | Native | macOS, Linux, Pi, rM |
| `zinc:async-storage` | React Native's AsyncStorage on `zinc:storage` | Zinc | macOS, Linux, Windows, Pi, rM, webOS, ESP32 |
| `zinc:socket` | TCP, UDP and Unix sockets, DNS, WebSocket client and server | Native | macOS, Linux, Pi, rM |
| `zinc:process` | Child processes (args, streams, kill) | Native | macOS, Linux, Pi |
| `zinc:ffi` | C functions of shared libraries (libffi) | Native | macOS, Linux |
| `zinc:script` | Sandboxed JavaScript at run time (QuickJS-ng) | Native | macOS, Linux, Pi, rM |
| `zinc:wasm` | WebAssembly on wasm3 | Native | macOS, Linux, Pi, rM |
| `zinc:system` | Desktop integration: notifications, menus, tray, dialogs, shortcuts, clipboard | Native | macOS, Linux |
| `zinc:webview` | Embedded web views (WKWebView), Tauri-like messages | Native | macOS |
| `zinc:devtools` | UI inspector for Chrome DevTools | Native | macOS, Linux, Pi |
| `zinc:serial` | Serial ports (Arduino and other boards) | Native | macOS, Linux |
| `zinc:gphoto2` | Camera remote control over USB (libgphoto2) | Native | macOS, Linux, Pi |
| `zinc:leapmotion` | Ultraleap hand tracking (LeapC) | Native | macOS |
| `zinc:imu` | QMI8658 motion sensor | Native | ESP32, macOS, Linux |
| `zinc:device` | Board services: backlight, chip, heap | Native | ESP32, macOS, Linux |
| `zinc:remarkable` | reMarkable status bar (clock, battery, exit) | Native | rM, macOS, Linux |
| `zinc:remote` | View and drive a `display-remote` app | Native | macOS, Linux, Pi |
| `zinc:webos` | webOS services (Luna bus through PDL), root helper, notifications | Native | macOS, Linux |
| `zinc:sonos` | Sonos speakers (UPnP): rooms, groups, playback, volume, radios | Zinc | macOS, Linux, Pi, rM |
| `zinc:spotify` | Spotify Web API: paged lists, search, playback | Zinc | macOS, Linux, Pi, rM |

### Display drivers

Chosen by the target or `zinc.json`, not imported; all native.

| Plugin | What it does | Platforms |
|---|---|---|
| display-gl | GPU screen: OpenGL (SDL3) on macOS, KMS/EGL/GLES 2 on Pi and Linux, GLES 2 through Palm's SDL on webOS | macOS, Pi, Linux, webOS |
| display-webos | First TouchPad driver: SDL 1.2, software frames, multitouch | Linux |
| display-fbdev | Linux framebuffer (`/dev/fb0`) with keyboard, mouse and touch | Linux, Pi |
| display-remote | Headless: streams frames over TCP to `zinc:remote` viewers | macOS, Linux, Pi |
| display-rmpp | reMarkable Paper Pro e-ink, pen and touch | rM (emulated on macOS, Linux) |
| display-st7789 | ST7789 and ILI9341 LCDs over SPI, CST820 touch | ESP32, macOS |
| display-ssd1306 | SSD1306 OLEDs over I2C | ESP32, Pi, Linux, macOS |
| display-ws2812 | WS2812 (NeoPixel) LED matrices | ESP32, Pi, Linux, macOS |
| display-scrollphat | Pimoroni Scroll pHAT (11x5 LEDs) over I2C | Pi, Linux, macOS |

Sonos, Spotify and `zinc:webos` also run on the TouchPad (`examples/music`), though their manifests do not list `webos` yet; Windows is
declared by `async-storage` only and not yet proven anywhere.

## Documentation

- [Developer guide](docs/guide/README.md): getting started, language, UI apps, headless services, plugins, testing, distribution,
  security, web APIs.
- UI: [docs/ui.md](docs/ui.md), [docs/ui-kit.md](docs/ui-kit.md), [docs/nuxt-ui.md](docs/nuxt-ui.md),
  [docs/react-native.md](docs/react-native.md). Targets: [docs/targets/](docs/targets/), boards: [docs/boards.md](docs/boards.md).
- Working on Zinc: [AGENTS.md](AGENTS.md) (map, workflow, backlog), [next/ARCHITECTURE.md](next/ARCHITECTURE.md),
  [next/RULES.md](next/RULES.md), [next/TESTING.md](next/TESTING.md); decisions in
  [docs/reports/zinc-next-decisions.md](docs/reports/zinc-next-decisions.md), measures in
  [docs/reports/zinc-next-perf.md](docs/reports/zinc-next-perf.md), hardware notes in [docs/reports/hardware/](docs/reports/hardware/).
- The prototype: [docs/prototype.md](docs/prototype.md).

## Layout

```
next/        Zinc Next: src/ (frontend, ir, zbc, vm, aot, rt, host, qjs, gl, text, tc, dev, lsp), include/zn, tests/, tools/, backlog/, app/
lib/         the standard library in Zinc (std/, the UI kits), shared by both generations; zinc.d.ts
plugins/     optional modules and display drivers, one directory each (plugin.json)
examples/    the demos every engine must run unchanged
templates/   the projects of `zinc new`
targets/, boards/, devices/   target capabilities, board presets, simulated devices
docs/        guides, plugin and target docs, reports, decisions
compiler/, runtime/, sim/, docker/   the prototype
apps/studio, integrations/, site/    ZincStudio, Figma and reMarkable integrations, the web site
```
