<div align="center">

# ⚡ Zinc

**Write it once in TypeScript. Run it natively everywhere, from a Mac to an ESP32.**

Desktop and mobile apps the way Electron makes them, without shipping a browser.<br>
UI, games, 3D, video and hardware, from one strict, typed subset of TypeScript and JSX.

[Quick start](#-quick-start) · [The CLI](#-the-cli) · [Demos](#-demos) · [Plugins](#-plugins) · [Guide](docs/guide/README.md)

<img src="docs/img/hero.png" alt="The hero demo: an app with an intro, screens, transitions and a gallery" width="820">

</div>

## ✨ Why Zinc

- 🚀 **Native, not embedded.** Your program is interpreted while you work and compiled to C++ when you ship: one executable, no
  JavaScript engine or browser inside, a fast start on modest hardware.
- 🌍 **One program, every screen.** A Mac, Windows, Linux, every Raspberry Pi, a reMarkable, an HP TouchPad from 2011, an ESP32, a PS2.
- 🧰 **Batteries included.** One `zinc` command builds, runs, debugs, tests, packages and flashes; cross builds need no Docker and no SDK.
- 🎨 **UI people already know.** Solid or React models, Tailwind-like classes, a shadcn-style kit, Nuxt UI 4 and React Native components,
  drawn by a GPU renderer that also runs on a Pi's VideoCore IV.
- 🔌 **Web APIs on real devices.** `fetch`, WebSocket, `crypto.subtle`, `localStorage`, and the battery, sensors, vibration, orientation and
  notifications of the device the program runs on.
- 📦 **45 plugins.** three.js, video, sound, MIDI, maps, physics, SQLite, Sonos, Spotify, AsyncStorage, and drivers for LED matrices,
  e-ink and OLED screens.

## 🚀 Quick start

```sh
curl -fsSL https://github.com/zinc-engine/zinc/releases/latest/download/install.sh | sh   # macOS, Linux; nothing to compile
zinc doctor                                   # what this machine can do
zinc new desktop-app my-app && cd my-app
zinc run                                      # a window opens; edit, save, it reloads
```

<details>
<summary>Build from the sources (Windows, or to work on Zinc)</summary>

CMake 3.20+ and a C++20 compiler; every library is vendored, Node.js is not needed.

```sh
cd next && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && tools/build zinc
build/zinc run ../examples/hero
```

</details>

A first app, step by step: [docs/guide/01-getting-started.md](docs/guide/01-getting-started.md).

## 🧑‍💻 The CLI

Everything goes through one command.

| I want to… | Command |
|---|---|
| start a project from one of 13 templates (game, 3D, dashboard, IoT, e-ink, service…) | `zinc new game my-game` |
| run it, with hot reload and a DevTools inspector | `zinc run` · `zinc dev` |
| run plain JavaScript (three.js, PixiJS, Phaser) as it is | `zinc run app.js --engine quickjs` |
| set breakpoints in VS Code or Chrome | `zinc debug --dap` · `zinc debug --cdp` |
| understand an error | `zinc explain Z0104` |
| test on the interpreter, in native code, on QuickJS or a simulated device | `zinc test --runner aot` |
| try it on a device I do not have | `zinc run --simulate hp-touchpad` |
| build a native executable, for this machine or another | `zinc build` · `zinc build --target aarch64-linux` |
| flash a board | `zinc flash --target esp32` |
| drive a Pi or a Mac from my desk (shell, files, apps, logs) | `zinc agent` on it, `zinc device` here |
| ship a .app, a single executable or a `.zapp` | `zinc export` · `zinc pack` |
| publish a version and signed updates | `zinc publish` |
| add a plugin from the signed index | `zinc add <plugin>` |
| capture frames, measure speed | `zinc capture` · `zinc bench` |

<details>
<summary>🎯 Cross-build targets</summary>

`zinc build --target <target>` uses a pinned zig toolchain that `zinc toolchain` downloads:

| Target | Machines |
|---|---|
| `aarch64-macos` · `x86_64-macos` | Mac, Apple silicon and Intel |
| `x86_64-windows` | Windows 10 and 11 (console programs for now) |
| `x86_64-linux` | PCs and servers |
| `aarch64-linux` | Raspberry Pi 3, 4 and 5 (64-bit), reMarkable Paper Pro |
| `armhf-linux` | every 32-bit Raspberry Pi OS, Pi 1 and Zero included |
| `armv7-linux` | NTC CHIP and PocketCHIP |
| `armv7-webos` | HP TouchPad on webOS 3 |
| `esp32` | flashes the board, or runs it in Espressif's QEMU |

</details>

## 🎮 Demos

<table>
<tr>
<td width="33%"><img src="docs/img/zed-editor.png" alt="A Zed-style code editor"><br><b>Code editor</b><br><code>zinc run examples/zed-editor</code></td>
<td width="33%"><img src="docs/img/pinball3d-play.png" alt="A 3D pinball table in play"><br><b>3D pinball</b><br><code>zinc run examples/pinball3d</code></td>
<td width="33%"><img src="docs/img/map-explorer.png" alt="An offline vector map of Paris"><br><b>Offline maps</b><br><code>zinc run examples/maps/explorer</code></td>
</tr>
<tr>
<td><img src="docs/img/kit-gallery-dark.png" alt="The component kit in dark mode"><br><b>Component kit</b><br><code>zinc run examples/ui/kit-gallery</code></td>
<td><img src="docs/img/music-touchpad.png" alt="The Musique app on an HP TouchPad"><br><b>A Sonos remote on a 2011 tablet</b><br><code>examples/music/install.sh</code></td>
<td><img src="docs/img/music-weather.png" alt="The weather page of Musique"><br><b>Weather, clocks, carousel</b><br><code>zinc run examples/music</code></td>
</tr>
</table>

More: `examples/hero`, `examples/nuxt-ui`, `examples/rn-showcase`, `examples/three/gltf-viewer`, `examples/leapmotion`,
`examples/hardware` (the device web APIs on one screen, try it with `--simulate hp-touchpad`).

## 🔌 Plugins

Plugins live in `plugins/`, one directory each, and are compiled into a program only when it imports them. **Native** ones hold C/C++
code or a library; **Zinc** ones are written in Zinc and run wherever the modules they use do. `zinc plugins` lists them for your project;
the guides are in [docs/plugins/](docs/plugins/). Abbreviations: Pi = Raspberry Pi, rM = reMarkable Paper Pro, Web = WebAssembly.

<details>
<summary><b>36 modules</b>: 3D, video, sound, maps, physics, storage, network, desktop, hardware</summary>

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

</details>

<details>
<summary><b>9 display drivers</b>: GPU, framebuffer, e-ink, LCD, OLED, LED matrices</summary>

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

</details>

Sonos, Spotify and `zinc:webos` also run on the TouchPad (`examples/music`), though their manifests do not list `webos` yet; Windows is
declared by `async-storage` only and not yet proven anywhere.

## 📚 Documentation

- 📖 [Developer guide](docs/guide/README.md): getting started, language, UI apps, services, plugins, testing, distribution, security, web APIs
- 🎨 UI: [ui](docs/ui.md), [kit](docs/ui-kit.md), [Nuxt UI](docs/nuxt-ui.md), [React Native](docs/react-native.md) · 🎯 [targets](docs/targets/) · 🔧 [boards](docs/boards.md)
- 🛠 Working on Zinc: [AGENTS.md](AGENTS.md), [architecture](next/ARCHITECTURE.md), [rules](next/RULES.md), [testing](next/TESTING.md),
  [decisions](docs/reports/zinc-next-decisions.md), [performance log](docs/reports/zinc-next-perf.md), [hardware notes](docs/reports/hardware/)
- 🧪 [The prototype](docs/prototype.md): the first generation (TypeScript to C++17 on Node), kept as the specification

<details>
<summary>🗂 Repository layout</summary>

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

</details>
