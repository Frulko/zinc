# Zinc Go: which demos of `examples/` run on an iPhone

Read-only survey, 2026-10-25. Source of truth: `plugins/*/plugin.json`, `examples/*/zinc.json` and imports, `src/cli_core.cpp` (`playerProgram`, `playerModules`, `exportIos`, `devLan`), `CMakeLists.txt`, `docs/reports/zinc-next-zinc-go.md`, ZN-631 notes. Nothing was built or run: "runs today" is derived from imports and manifests, not from a test. Only rn-showcase (and Zinc Go itself) are proven on the iOS simulator (`tests/t2/zinc_go_phones.sh`).

## 1. How Zinc Go decides what it can run

- Zinc Go is `examples/zinc-go` exported with `"player": true`. The home screen is a hot unit (ZBC); every program from `zinc dev --lan` is also compiled on the Mac to a hot unit for the phone profile (`--profile ios`) and sent over the LAN. The phone only interprets ZBC (`src/vm/vm.cpp` in `zn_app_player`). Source: `hotUnit` / `devLan` in `src/cli_core.cpp` ~3217-3430.
- Plugins linked into the player (`playerProgram`, cli_core.cpp 1450): every plugin that (a) has a `native/*.spec.ts` (native code), (b) is not `kind: display`, and (c) has an `ios` key under `targets` in its `plugin.json`. Pure-Zinc plugins (async-storage, gsap, sonos, spotify, osc, ...) "travel in the programs zinc dev sends". Anything else gets `missing <plugin>` back and `zinc dev` prints "this program cannot run in this Zinc Go" (AC 6 of ZN-631).
- Native plugins with an iOS target today (the player's set): `3d` (software rasterizer, no GL: `ios: {}`), `audio`, `camera`, `link`, `lottie`, `socket`, `sqlite`, `svg`, `system`, `video` (AVFoundation, `video.ios.mm`), `webos`, `webview`. Core modules (`zinc:gfx`, `sys`, `ui*`, `fs`, `net`, `storage`, `assets`, `icons`, `stage`, `web`, `react-native`, `gpio`, `mqtt`, `telemetry`, `events`, ...) are always there.
- Native plugins with NO iOS target (so absent from the player): `animation`, `ble`, `canvas2d` (`zinc:canvas`), `device`, `devtools`, `ffi`, `gphoto2`, `imu`, `lan`, `leapmotion`, `loro`, `lvgl`, `map`, `mapping`, `microphone`, `midi`, `physics2d`, `physics3d`, `process`, `qrcode`, `remarkable`, `remote-view`, `script` (QuickJS), `serial`, `wasm`, `webrtc`. Pure-Zinc plugins without an iOS key (`gestures`, `ink`, `loader`, `network`, `pixelfont`, `sprite`, `tilemap`) probably work (their code travels in the unit) but nothing proves the compile for profile `ios` accepts them: marked "check" below.
- Capabilities: `targets/capabilities.json` profile `ios` has `process: false`, `dynlib: false`, `desktop: false`, `notifications/tray/menubar/dialogs/windowctl: false`, `gpu: "metal"`, `camera: true`, `microphone: false`, `audio: true`, `fs: true`.

### What exactly blocks QuickJS and WebGL on iOS

- **QuickJS**: the engine is already compiled into every app (`zn_app` links `zn_script`, CMakeLists.txt ~542-546; `zn_quickjs` is a plain static C lib). What is missing is the wiring: `zinc dev --lan` only emits ZBC (`--emit=hot`), `src/app/player.cpp` only loads a ZBC unit (zinc-go report §5: "Programs on QuickJS are not served"), the DOM/web environment (`lib/std/webenv.js`, `src/qjs/*`, the `src/main.cpp` host and its `webglHook`) lives in the `zinc` CLI binary, not in `zn_app`. The `script` plugin (the only way a Zinc program embeds QuickJS) has no `ios` target.
- **WebGL / zinc:gl**: `exportIos` forces `set(ZN_WEBGL OFF CACHE BOOL "" FORCE)` (cli_core.cpp 1944; Android 1643 likewise), so `zn_gl` (`src/gl/webgl1*.cpp, webgl2*.cpp, webgl_host.cpp, webgl_install.cpp`) and the QuickJS WebGL module `zn_webgl` (`src/gl/webgl_js.cpp`) are not built. Behind that flag is a deeper gap: `zn_gl` is written for desktop OpenGL (glad `gl.c` loader, `src/gl/offscreen.cpp` over an SDL GL context, GLSL through glslang) while the iOS host draws with Metal (`targets/macos/hal_metal.mm`; the iOS `zn_app_host` links Metal, not OpenGL/GLES). CMake gates the module on `TARGET SDL3::SDL3 AND ZN_WEBGL` (CMakeLists.txt 813-830). So WebGL on iOS needs an ES 3 backend (SDL3's uikit EAGL context or ANGLE-on-Metal), a GLES glad loader, and the offscreen helper adapted: not just flipping the flag.

## 2. Per-demo table

Legend. Engine: `TS` = Zinc TS/TSX interpreted as a hot unit; `JS` = QuickJS project. Verdict: **Proven** (tested on the iOS simulator), **Likely** (every import is core or has an iOS native; untested), **Degraded** (compiles, but a desktop/hardware feature is a no-op), **Blocked by X**.

| Demo | Engine | Zinc modules imported (plugins) | Verdict |
|---|---|---|---|
| zinc-go | TS | camera, react-native | Proven (it is the player) |
| rn-showcase | TS | audio, camera, lottie, video, socket, react-native | Proven on the simulator; needs heap>=32M |
| hello, lang | TS | none | Likely |
| bouncing-ball, flipctl, glass-icon-reveal, swift-observatory, robot-eyes, robot-eyes-oled | TS | gfx, sys, stage | Likely (trivial; esp32 ones are just gfx) |
| pinball, pocket-hero | TS | gfx, storage, ui/solid | Likely |
| inferno-todo, text, ui, perf-compare, zinc-libgodot, rn-port, rn-tester, nuxt-ui | TS | ui, kit, solid/react, nuxt (all in lib/std); ui also lottie | Likely (same stack as rn-showcase) |
| hero-novideo | TS | lottie, ui | Likely |
| hero | TS | lottie, video, ui | Likely (video.ios.mm exists; ZN-628 done; a big mp4 in assets would travel to the phone: check) |
| carnet | TS | socket, svg, fs, ui/dnd | Likely (keyboard + fs sandbox: check) |
| chataigne, osc | TS | osc (pure Zinc over core net) | Likely |
| iot-panel, modules-showcase | TS | gpio, mqtt, telemetry, osc, net | Degraded (no GPIO on a phone; UI runs) |
| music, music-tree | TS | link, sonos, spotify, socket, svg, webos, opener | Likely (local network permission: `NSLocalNetworkUsageDescription` is written by the export for `net`) |
| webos-shell | TS | webos | Runs but pointless on a phone |
| webview | TS | webview (ios target) | Likely |
| webcam | TS | camera, fake-camera (local) | Likely |
| 3d, blender-library, blender-world, godot-to-zinc, pinball3d, tokyo | TS | 3d (software), assets, fs, audio, stage, hardware | Likely (CPU rasterizer on a phone: perf unmeasured; `zinc:hardware` answers from the phone glue) |
| marble, platformer | TS | 3d/audio, sprite, tilemap (pure, no ios key) | Likely, check the missing `ios` key |
| led | TS | pixelfont (pure, no ios key), ui/react | Likely, check the same |
| godot-zinc-ui | TS | warehouse (local), native | Check (local native module is not in the player) |
| breakout | TS | gfx, native; zinc.json targets only vita | Check (`zinc:native` is project-local) |
| native-module | TS | project's own native module | Blocked by: a project plugin cannot be added to a prebuilt player (needs its own export) |
| system | TS | system/dock, tray, menu, notification, dialog | Degraded (desktop APIs; the iOS capabilities say false) |
| pinball3d-editor | TS | system/dialog, window, svg, 3d | Degraded/blocked by desktop dialogs, window, mouse editing |
| kanban, zed-editor, agents, process | TS | `zinc:process` (+fs, opener) | Blocked by plugin `process` (iOS cannot spawn processes) |
| museum-table | TS | process, system/update, window, video, 3d | Blocked by `process` (+ desktop window/update) |
| animation-lab, lantern-post | TS | `zinc:animation` | Blocked by plugin `animation` (macOS-only target) |
| canvas, three | TS | `zinc:canvas` | Blocked by plugin `canvas2d` (no ios target) |
| maps | TS | `zinc:map`, citymap | Blocked by plugin `map` |
| video (demo) | TS | `zinc:mapping`, gpio, osc | Blocked by plugin `mapping` |
| lan-arena | TS | `zinc:lan` | Blocked by plugin `lan` (macos/linux only) |
| midi | TS | `zinc:midi` | Blocked by plugin `midi` (no CoreMIDI backend) |
| serial | TS | `zinc:serial` | Blocked by `serial` (no iOS serial; by design) |
| leapmotion | TS | `zinc:leapmotion` | Blocked by `leapmotion` (desktop USB device) |
| camera (demo) | TS | `zinc:gphoto2` | Blocked by `gphoto2` (USB camera lib) |
| remarkable | TS | ink, remarkable | Blocked by `remarkable` (device-specific) |
| remote | TS | `zinc:remote` | Blocked by plugin `remote-view` |
| webrtc-call, webrtc-chat | TS | webrtc, microphone (call also camera) | Blocked by `webrtc` + `microphone` (iOS `microphone: false`) |
| boards | TS | device, imu, process | Blocked by `device`, `imu`, `process` (board-only) |
| scripting, webgl-cube, webgl-studio | TS | `zinc:script` (QuickJS inside a Zinc program), WebGL | Blocked by plugin `script` + WebGL |
| gl-cube | TS | `zinc:gl` | Blocked by WebGL (zn_gl not built, no GLES backend) |
| fatty | JS (`engine: quickjs`) | audio, storage, system/menu | Blocked by QuickJS in the player |
| carnet-nbe | JS (`engine: quickjs`) | sqlite, socket, svg, system/dialog, window | Blocked by QuickJS in the player |
| js-three, js-pixi, js-phaser, js-spline | JS (`main.js`, importmap, `web: true`) | WebGL via the DOM shim | Blocked by QuickJS + WebGL |
| js-p5, js-gsap, js-anatomy | JS (`main.js`) | canvas `getContext` via the DOM shim | Blocked by QuickJS (+ the canvas/web environment; WebGL if they use it) |
| service, testing | TS | headless (mqtt/net, assert/sqlite) | Not a UI demo: n/a |
| pinball-kit | TS | library for the pinballs (physics2d/3d) | Not an app: n/a |

Out of scope: device-specific: `esp32-arduino`, `esp32-ble`, `esp32-espnow`, `esp32-gpio`, `esp32-qrcode`, `esp32-widgets`, `esp32-wifi`, `hardware`, `hardware-kit`, `hardware-n3ds`, `hardware-ps2`, `hardware-psp`, `hardware-vita`, `n3ds-kit`, `n3ds-pinball`, `n3ds-platformer`, `n3ds-starfall`, `touch-check` (lvgl on an esp32 panel), `GUIDELINES.md`.

### Count (81 in-scope directories)

- Runs today: **43** = Proven 2 (zinc-go, rn-showcase) + Likely 36 (all imports core or iOS-native; untested on an iPhone) + Degraded but running 5 (iot-panel, modules-showcase, system, webos-shell, pinball3d-editor).
- Blocked: **32** = QuickJS/JS engine 9 (fatty, carnet-nbe, js-x7; 7 of them also WebGL or canvas), WebGL/`script` 4 (gl-cube, scripting, webgl-cube, webgl-studio), `process` 5 (kanban, zed-editor, agents, process, museum-table), canvas2d 2, animation 2, map/mapping 2, webrtc+microphone 2, boards 1, lan 1, midi 1, serial 1, leapmotion 1, gphoto2 (camera demo) 1, remarkable 1, remote 1.
- Uncertain: **3** (breakout, godot-zinc-ui, native-module: project-local `zinc:native` code).
- Not applicable: service, testing, pinball-kit.

## 3. Blockers ranked by demos unblocked

| # | Blocker | Unblocks | Files to change | Size |
|---|---|---|---|---|
| 1 | **QuickJS projects served to the player** (new unit kind: bundled JS + importmap, DOM/web env in `zn_app`) | fatty, carnet-nbe fully; with 2/3 below also js-three, js-pixi, js-phaser, js-spline, js-p5, js-gsap, js-anatomy: 9 | `src/cli_core.cpp` (`hotUnit`, `devLan`: emit/send JS bundle for `.js` entries and `engine: quickjs`), `src/app/player.cpp` (second program kind, start QuickJS via `src/qjs/*`), `CMakeLists.txt` (`zn_app_player` links `zn_qjs`, `lib/std/webenv.js` in the package), plugin `script` ios target | L |
| 2 | **WebGL on iOS** (`zn_gl` and `zn_webgl` with a GLES/ANGLE backend; drop the `ZN_WEBGL OFF` in the ios export) | gl-cube, webgl-cube, webgl-studio, js-three, js-pixi, js-phaser, js-spline: 7 (JS ones also need #1) | `src/cli_core.cpp` 1944 (and 1643 Android), `CMakeLists.txt` 813-850 (build zn_gl without desktop GL), `src/gl/offscreen.cpp`, glad GLES loader (`third_party/glad`), `targets/macos/hal_metal.mm` or an EAGL context via SDL3, `src/gl/webgl_install.cpp` registration in `player_modules.cpp` | L |
| 3 | **`script` plugin on iOS** (QuickJS inside a Zinc program) | scripting, webgl-cube, webgl-studio: 3 (with #2 for the webgl ones) | `plugins/script/plugin.json` (`targets.ios`), `plugins/script/native/*` check | S |
| 4 | **`process` stub on iOS** (compile + a clear "not available" error at run time, as the sandbox forbids spawning) | kanban, zed-editor, agents, process, museum-table, boards: 5-6 (UIs show up, features degrade) | `plugins/process/plugin.json` (`targets.ios`) and a native stub `plugins/process/native/process.ios.cpp`, `targets/capabilities.json` unchanged | S |
| 5 | **`canvas2d` on iOS** (CPU canvas, portable) | canvas, three; also js-p5, js-gsap, js-anatomy once #1 exists: 2 now, 5 later | `plugins/canvas2d/plugin.json` `targets.ios` (+ check native for macOS-only calls) | S |
| 6 | **`animation`, `physics2d/3d`, `sprite`, `tilemap`, `pixelfont`, `gestures`, `ink`, `loader`, `network` iOS keys** (portable C++/Zinc, only the manifest line is missing) | animation-lab, lantern-post now (2); removes the "check" on marble, platformer, led | each `plugins/<name>/plugin.json` `targets.ios: {}`; `tests/t0/export_*.sh` for the player set | S |
| 7 | **`map` and `mapping` iOS** | maps, video: 2 | `plugins/map`, `plugins/mapping` manifests and native (check desktop-only calls) | S/M |
| 8 | **`lan` (UDP discovery, POSIX sockets) iOS** | lan-arena: 1 | `plugins/lan` | S/M |
| 9 | **`microphone` + `webrtc` iOS** (AVAudioEngine capture, libdatachannel/libwebrtc build for arm64 iOS; capabilities `microphone: false` and `NSMicrophoneUsageDescription` exist) | webrtc-call, webrtc-chat: 2 | `plugins/microphone/native/*.ios.mm`, `plugins/webrtc` build, `src/cli_core.cpp` permission mapping already there | L |
| 10 | **`midi` (CoreMIDI), `qrcode`, `remote-view`, `leapmotion`/`gphoto2`/`serial`/`remarkable`/`device`/`imu`** | 1 demo each; the last five are desktop or board hardware and should stay out | per plugin | M for midi, not worth it for hardware ones |
| 11 | **Project-local plugins in a prebuilt player** (native-module, godot-zinc-ui, any user plugin) | 2 | needs a per-project player export (already possible: add the plugin and `zinc export --target ios` the project itself) | by design |

Cheapest path: #3 + #4 + #5 + #6 + #7 are manifest lines or small stubs (S, one session together) and move about 10 demos from blocked to running. #1 + #2 are the two L items and together carry the 9 JS demos and the WebGL ones.

Unmeasured risks for the "Likely" group (worth one session on a real iPhone): the 16 MB-class demos' memory (profile `ios` heap 256 MB; carnet/zed need heap>=32M, ok), `fs` sandbox paths, hardware keyboard absence (agents, zed-editor, kanban), CPU `zinc:3d` frame rate, video assets size over LAN, `NSLocalNetworkUsageDescription` prompt for sonos/spotify/osc.

## 4. Backlog notes (`backlog/later.md`, tasks)

- ZN-631 (Done 2026-10-25): Zinc Go built; "Not in the player yet: QuickJS (.js projects) and zinc:gl/three (ZN_WEBGL is off in phone exports)". The Nexus 7 camera scan moved to ZN-752 (Backlog). later.md lines: 178 (on-device red box for compile errors), 179 (Fast Refresh does not re-run effect cleanups), 180 (stray "18" with several `children?: () => i32` children), 452 (rn-showcase crashes on the Nexus 7 when turning to portrait).
- ZN-792 (device mode of the player; the iOS player announces `_zinc._tcp` via Bonjour): later.md 252-257 (mDNS for console players, PSP entropy, touchpad profile, webOS player, update the Bonjour TXT `pair` flag, run on an Android emulator) and 516-518 (cross-platform pass: "the phone player on a real iPhone (signing, the local network prompt, Bonjour on Wi-Fi)").
- ZN-628 (zinc:video on phones; line 168 of later.md) is Done in task terms: iOS has `video.ios.mm`; only hero's plan and ZN-751 (pause video on lifecycle pause) remain.
- ZN-620 (line 141: zapp reader in zn_app) is the older note on bundling an interpreter app; unrelated to the LAN player.
- Nothing in later.md or the tasks plans a QuickJS or WebGL path for the player: ranked blockers #1-#2 above would need new tasks (the backlog is frozen: `New-task: owner <request>` trailer).
- Important: the documented limit "an iPhone needs the local network permission (`NSLocalNetworkUsageDescription`), not in the iOS export yet" is stale: `exportIos` writes it for permission `net` (cli_core.cpp ~1833) and the player adds `NSBonjourServices`.
