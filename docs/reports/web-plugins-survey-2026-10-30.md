# Plugins on the web target: how each one can run in a browser page (survey, 2026-10-30)

Read-only survey of the 69 directories of `plugins/`. Sources read: `plugins/*/plugin.json` and `plugins/*/web/`, `docs/targets/web.md`, `web-demos.md`, `docs/reports/web-bridge-research.md`, `web-export-bridge-audit.md`, `parity/04-library-choices.md`, `targets/capabilities.json`, `targets/web/browsers.json`, `third_party/README.md`. "Demos" = directories of `examples/`, `app/` and `templates/` that import the module (grep of `from 'zinc:x'`).

Verification: browser support figures come from `targets/web/browsers.json` (MDN browser-compat-data and caniuse, read 2026-10-17 by the project) and the sources cited in `web-bridge-research.md`. I did not re-check any API against live docs in this pass (no Context7 or web search was run). Library names, licences and sizes below are from memory of the projects and are marked UNVERIFIED where a figure is given. Only Chrome is tested by the project; Firefox and Safari columns are research.

Routes: **A** browser API, **B** proven JS/wasm library (or the plugin's own C compiled with `web.wasm`), **C1** local dev bridge (already built, loopback, developer machine only), **C2** hosted stateless relay, **D** not meaningful (show a simulator, sample data or a "needs the desktop app" message), **P** pure Zinc, no native side (runs anywhere, "expected" in `web.md`, not tried).

## Summary

Primary route per plugin (69): **A 22, B 15, P 9, C1 6, D 17**. C2 is the primary route of none: every candidate relay would forward arbitrary traffic or reach a private LAN, so it is not safe to host publicly (see the notes). 13 plugins are already complete for the web (audio, browser, camera, canvas2d, lottie, map, microphone, physics2d, sqlite, svg, three, video, webrtc); 8 more have a partial backend (gphoto2, midi, serial, osc, socket, system, webos stub, three-only 3d). 48 have nothing yet.

The dev bridge covers the plugins that have no `web` key and a real native side (process, lvgl, device, devtools, ffi, ...) on the developer's machine only. Two traps: a plugin with a `web.entry` (socket, osc) is not bridged, so TCP/UDP does not work even in `zinc dev`; and a plugin with no native side of its own (sonos, spotify, link) has nothing to bridge, it needs `zinc:socket` to reach the bridge.

The 10 highest-value items, ordered by demos unlocked against effort:

| # | Item | Route | Effort | Demos unlocked |
|---|---|---|---|---|
| 1 | `zinc:3d` web backend: either the z-buffer renderer (`render3d.host.cpp`) as `web.wasm` blitted as an image (pixel-exact, slower), or a WebGL2 path over the existing `zinc:gl` rows (ZN-563.03 is the filed task) | B / A | L | 14: app/atelier, 3d, animation-lab, blender-library, blender-world, godot-to-zinc, lantern-post, leapmotion, ... |
| 2 | `zinc:socket` TCP/UDP/DNS in `zinc dev` through the dev bridge (the `entry` today throws); unlocks `zinc:sonos`, `zinc:lan`, `zinc:link` and the plain-socket demos on the developer's machine | C1 | M | 10 (socket) + sonos 3 + lan 1 (music, music-tree, ipod, lan-arena, carnet...) |
| 3 | `zinc:system` gaps: dialogs and pickers with `showOpenFilePicker`/`<input type=file>`, menus as in-page DOM menus (tray, autostart, shortcuts stay unsupported) | A | M | 14 (atelier, devicesim, agents, carnet-nbe, fatty, ipod, museum-table, music...) |
| 4 | `zinc:lvgl` as `web.wasm` (the plugin is C on the native ABI, `lvgl.abi.c`, so zig can build it) plus a canned `zinc:device` and `zinc:imu` from DeviceMotion | B + A + D | M | 3: esp32-widgets, touch-check, boards (and templates/iot-board) |
| 5 | Asset build on web (atlases, tilemaps, textures) so `zinc:sprite` and `zinc:tilemap` demos start; this is an engine gap, not a plugin (`backlog/later.md:747`) | engine | M | 3+: platformer (fails today), marble, n3ds-platformer, templates/game-2d |
| 6 | `zinc:script` on web: QuickJS compiled to wasm with the plugin's own vendored sources (typed host functions need a synchronous engine, so a Worker or an iframe does not fit) | B | M | 3: scripting, webgl-cube, webgl-studio |
| 7 | `zinc:sqlite` persistence: replace the `localStorage` snapshot (about 3 MB cap) by IndexedDB (or OPFS) holding `sqlite3_serialize` bytes | A | S | 4: carnet-nbe, ipod, notify-relay, testing |
| 8 | `zinc:qrcode` as `web.wasm` (one C file, Nayuki, no dependencies) | B | S | 2: esp32-qrcode, esp32-wifi; any app showing a pairing code |
| 9 | `zinc:animation` (ozz) as `web.wasm`, after item 1 | B | M | 2: animation-lab, lantern-post |
| 10 | `zinc:spotify` in the page: the Web API allows browser calls; PKCE login with WebCrypto and a token in `localStorage` replaces `login.py` | A | M | 2: music, music-tree |

Cheap leftovers (S each, few demos): `zinc:location` (Geolocation), `zinc:wasm` (alias to the global `WebAssembly`), `zinc:loro` (loro-crdt npm), `zinc:markdown` (md4c to wasm), `zinc:imageio` (EXIF in JS), `zinc:photos` (file picker).

## Table of all plugins

Effort is for the missing part only; "done" means nothing left to do.

| Plugin | Module | Does | Web status | Route | API or library | Effort | Demos |
|---|---|---|---|---|---|---|---|
| 3d | zinc:3d | Scene graph, materials, lights, z-buffer renderer | none; `bridge:false` (it would draw on the dev machine) | B or A | wasm of the software renderer, or WebGL2 via `zinc:gl` rows; `three` is the web substitute today | L | 14 |
| animation | zinc:animation | glTF skeletal animation (ozz), CPU skinning | none | B | ozz sources through `web.wasm` | M (needs 3d) | 2 |
| async-storage | zinc:async-storage | RN AsyncStorage on `zinc:storage` | none; depends on a `zinc:storage` web backend (UNVERIFIED: not found in `targets/web/runtime.js` by grep) | A | `localStorage` or IndexedDB | S | 0 |
| audio | zinc:audio | Sound effects and music, mixer | full: `web/audio.js` | A | Web Audio | done | 15 |
| ble | zinc:ble | BLE Nordic UART links | none | A | Web Bluetooth (Chromium only; not Firefox, not Safari/iOS) | M | 1 (esp32-ble) |
| browser | zinc:browser | Queries about the browser a page runs in | full: `web/index.ts` (web-only module) | A | feature tests | done | 0 |
| camera | zinc:camera | Webcams and phone cameras | full: `web/index.ts` | A | `getUserMedia` | done | 4 |
| canvas2d | zinc:canvas | Canvas 2D context | full: `web/index.ts` | A | the browser's Canvas2D | done | 4 |
| carplay | zinc:carplay | CarPlay media and controls | none | D | in-page mock of the head unit (text only) | S | 1 |
| device | zinc:device | Backlight, chip, flash, heap for board demos | none (bridge would answer with the dev machine) | D | canned values from the device simulator (`devices/`, `src/sim`) | S | 3 |
| devtools | zinc:devtools | CDP inspector on port 9229 | none | D | the browser's own DevTools; `zinc dev` already serves HMR | - | 0 |
| display-fbdev | - | Linux framebuffer + evdev | none | D | the page canvas is the display | - | 0 |
| display-gl | - | GL screen (SDL3, KMS/DRM) | none | D | same | - | 0 |
| display-remote | - | Headless; streams frames over TCP | none | D | could stream over WebSocket to a viewer page (needs a server, not a hosted page) | - | 0 |
| display-rmpp | - | reMarkable Paper Pro e-ink | none | D | CSS/canvas e-ink look as a post-process (`emulator.cpp` is C++, UNVERIFIED port effort) | M | 0 (via remarkable apps) |
| display-scrollphat | - | Scroll pHAT 11x5 LEDs (I2C) | none | D | in-page LED grid simulator | S | 0 |
| display-ssd1306 | - | SSD1306 I2C OLED, 1-bit dither | none | D | in-page 128x64 simulator | S | 0 |
| display-st7789 | - | ST7789 SPI LCD | none | D | in-page framed canvas | S | 0 |
| display-webos | - | HP TouchPad SDL 1.2 | none | D | not meaningful | - | 0 |
| display-ws2812 | - | NeoPixel matrix | none | D | in-page LED grid simulator | S | 0 |
| ffi | zinc:ffi | dlopen/dlsym C calls | none; bridge runs it on the dev machine | D (C1 in dev) | `WebAssembly` modules instead | - | 0 |
| gestures | zinc:gestures | Pan/pinch/rotate/tap | P: expected, not tried | P | Pointer Events already feed `zinc:gfx` | - | 0 |
| gphoto2 | zinc:gphoto2 | Camera remote control (PTP) | partial: `web/gphoto2.js`, no live view or vendor widgets, mock only | A then B | WebUSB (Chromium only); `web-gphoto2` (LGPL, Emscripten, about 5 MB, UNVERIFIED) for live view | L | 1 (camera) |
| gsap | zinc:gsap | GSAP tweens and timelines | P | P | none | - | 0 |
| imageio | zinc:imageio | Size, orientation, EXIF, thumbnails | none | B | `createImageBitmap` for size and thumbnails; `exifr` (MIT) or `ExifReader` (MPL-2.0) for EXIF (UNVERIFIED); files need a picker | M | 1 (photo-sorter) |
| imu-qmi8658 | zinc:imu | 6-axis IMU, tilt, shake | none (emulated from keys on desktop) | A | DeviceMotion/Orientation events (iOS asks permission; secure context) | S | 2 |
| ink | zinc:ink | Handwriting strokes, SVG export | P | P | Pointer Events carry pressure and pen | - | 6 |
| ipod | zinc:ipod | Classic iPods over libgpod | none | D | needs a USB mass storage mount; "needs the desktop app"; `examples/ipod-web` is a server, not a page | - | 2 |
| lan | zinc:lan | UDP datagrams and broadcast for games | none | C1 or A | dev bridge (once socket is bridged); for browser-only games, a WebRTC data-channel back end under the same API | M | 1 (lan-arena) |
| leapmotion | zinc:leapmotion | Ultraleap hand tracking | none | B | MediaPipe Hands/HandLandmarker (Apache-2.0, wasm + model, a few MB, UNVERIFIED) on the webcam as a stand-in | M | 1 |
| link | zinc:link | DNS-SD pairing and TLS J-PAKE between two Zinc programs | none | D | "needs the desktop app"; a WebRTC pairing over a signalling relay is possible but is a new protocol | L | 3 (music, music-tree, notify-relay) |
| loader | zinc:loader | Loader-stage screens | P | P | none | - | 0 |
| location | zinc:location | Where the device is | none | A | Geolocation (all browsers, secure context, asks the person) | S | 1 (geo) |
| loro | zinc:loro | Loro CRDT documents | none | B | `loro-crdt` on npm (MIT, wasm, same API by design) | S | 0 |
| lottie | zinc:lottie | Lottie animations | full: `web/lottie.js` | B | lottie-web 5.13, MIT, vendored | done | 4 |
| lvgl | zinc:lvgl | LVGL 9 widgets | none; dev bridge runs it (drawing on the dev machine, so useless in the page) | B | LVGL C through `web.wasm`, draw into a gfx image (LVGL has its own wasm ports; UNVERIFIED) | M | 2 |
| map | zinc:map | Vector maps | full: `web/index.ts`, `web/map.js` | B | MapLibre GL JS 5.24 (BSD-3-Clause, vendored) | done | 1 |
| mapping | zinc:mapping | GPU video-mapping compositor | none | A | WebGL2 through `zinc:gl` rows plus a `<video>` texture | L | 1 (video) |
| markdown | zinc:markdown | CommonMark + GFM via md4c | none | B | md4c to `web.wasm` (host is C++, a C shim needed) or `marked`/`markdown-it` (MIT) if the output may differ | M | 1 (app/markdown) |
| microphone | zinc:microphone | Microphones | full: `web/index.ts` | A | `getUserMedia`, AudioWorklet | done | 2 |
| midi | zinc:midi | MIDI in and out | full on Chromium and Firefox, mock-tested; no virtual ports; no Safari | A | Web MIDI | done (real-device pass open) | 1 |
| network | zinc:network | Interfaces, addresses, Wi-Fi scan | none | A (partial) / D | `navigator.onLine` and Network Information (Chromium: type, downlink); no interface list, no Wi-Fi scan in any browser | S | 1 (sidecar-screen) |
| osc | zinc:osc/full | OSC over UDP | partial: `web/index.ts` speaks it over a WebSocket (osc-js bridge format), mock-tested | C1 | a local `zinc osc-relay` (WS to UDP, bound to loopback) | S | 1 |
| pdf | zinc:pdf | PDF render on PDFium | none | B | PDFium wasm (synchronous, fits the sync API; build with `web.wasm`, size large) or pdf.js (Apache-2.0, async, would need a sync facade) | L | 1 (app/pdf) |
| photos | zinc:photos | Photo library (PhotoKit) | none | A | no library API in browsers; `<input type=file multiple accept=image/*>` or `showOpenFilePicker` | M | 1 |
| physics2d | zinc:physics2d | Box2D 3.1 | full: Box2D as wasm, `web/physics2d.js` | B | done | done | 1 |
| physics3d | zinc:physics3d | Jolt 5.6 | none | B | Jolt through `web.wasm` with a C shim (as physics2d), or `jolt-physics` npm (MIT, UNVERIFIED) | M | 1 (pinball-kit) |
| pixelfont | zinc:pixelfont | 5x7 and 3x5 bitmap fonts | P | P | none | - | 2 |
| process | zinc:process | Child processes | none; C1 works in `zinc dev` (`tests/t1/web_bridge.sh`) | C1; D hosted | hosted: "needs the desktop app" or a scripted fake process | - | 11 |
| qrcode | zinc:qrcode | QR codes from text | none | B | Nayuki QR (one C file, MIT) through `web.wasm`; or the Nayuki JS port | S | 2 |
| remarkable | zinc:remarkable | Status toolbar: clock, battery | none | D | local clock; Battery API is Chromium only | S | 6 |
| remote-view | zinc:remote | Viewer of `display-remote` over TCP | none | C1 | the bridge, or a WebSocket-serving `display-remote`; not C2 | M | 1 (remote) |
| script | zinc:script | Sandboxed QuickJS with host functions | none | B | the plugin's QuickJS-ng through `web.wasm` | M | 3 |
| serial | zinc:serial | Serial ports | full on Chromium, Firefox 151+ per sources (UNVERIFIED), mock-tested; no Safari | A | Web Serial | done (real-device pass open) | 1 |
| socket | zinc:socket | TCP, UDP, DNS, WebSocket | partial: WebSocket only (`web/index.ts`) | A + C1 | `WebSocket`; bridge fallback for the rest in dev | M | 10 |
| sonos | zinc:sonos | Sonos over UPnP, port 1400 | none; SSDP UDP throws, SOAP has no CORS | C1 | bridge via socket + a local HTTP forward; Sonos Cloud API needs a server-side secret, so a hosted demo shows sample rooms | M | 3 |
| spotify | zinc:spotify | Spotify Web API remote | none; API is browser-legal, login is `login.py` | A | PKCE in the page (WebCrypto), `fetch`; redirect must be https or a loopback IP | M | 2 |
| sprite | zinc:sprite | Atlas frames and animations | P, but needs the asset build, which web skips | P | engine gap (item 5) | M | 3 |
| sqlite | zinc:sqlite | SQLite 3.53 | full: wasm, `localStorage` snapshot (about 3 MB) | B | upgrade the store to IndexedDB/OPFS; `@sqlite.org/sqlite-wasm` is the alternative (Apache-2.0, OPFS needs a worker, UNVERIFIED) | S | 4 |
| svg | zinc:svg | Runtime SVG | full: `web/svg.js` | A | DOMParser, Path2D | done | 6 |
| system | zinc:system | Notifications, menus, dialogs, tray... | partial: `web/system.js` | A | Notifications, Clipboard, Share, Wake Lock (done); File System Access / `<input>` for pickers, DOM menus | M | 14 |
| three | three | three.js subset on zinc:3d | full: real three.js | B | three.js (MIT) | done | 2 |
| tilemap | zinc:tilemap | Tiled and LDtk levels | P, needs asset build | P | engine gap (item 5) | M | 3 |
| trieur | zinc:trieur | Card sorting UI | P | P | none | - | 2 |
| video | zinc:video | Video playback | full: `web/index.ts` | A | `<video>`; codecs per browser (W0604) | done | 4 |
| wasm | zinc:wasm | WebAssembly JS API on wasm3 | none (`web.md`: the browser has it) | A | alias the module to `globalThis.WebAssembly` | S | 0 |
| webos | zinc:webos | HP webOS services | full stub: answers false | D | done | done | 4 |
| webrtc | zinc:webrtc | RTCPeerConnection, data channels, tracks | full: `web/index.ts` | A | WebRTC | done (needs a signalling relay for a real call) | 2 |
| webview | zinc:webview | Web views over the window | none | A | `<iframe>` placed by the NativeView in the DOM render; sites that send X-Frame-Options/CSP are refused; `app/web-relay` (headless Chrome relay) is the existing answer for those | M | 1 |

## Notes on the non-obvious plugins

**Why no C2 (public relay).** A WebSocket-to-TCP/UDP relay is an open proxy: anyone can aim it at any host (SSRF, UDP reflection, port scans), and the things Zinc needs are on the user's private LAN (Sonos on :1400, OSC on a studio network, display-remote), which a hosted server cannot reach. The only safe hosted relays are narrow: (a) a WebRTC signalling relay for `zinc:webrtc` calls and a possible `zinc:link` pairing, which carries only SDP and ICE text; (b) a CORS fetch proxy with an allow-list of public hosts (radio logos in `examples/music` are refused by CORS today), with no private-range targets and rate limits. Everything else is C1: `zinc dev`, or a program the user runs on their own network. `app/web-relay` already exists as a headless-Chrome reading relay and could host (b); I did not assess its deployment.

**socket, sonos, lan, link.** `zinc:socket` has a `web.entry`, which wins over the dev bridge, so even `zinc dev` cannot do TCP/UDP. Making the entry fall back to the bridge's native `Socket`/`Datagram` when the bridge is up (and to `ZnUnsupported` otherwise) fixes socket, sonos (SSDP + SOAP, since `fetch` to :1400 is blocked by CORS the SOAP calls must also go through the bridge), and lan in one change. Chrome 142 and later prompts for Local Network Access, and Chrome 147 also gates WebSocket to local addresses (secondary sources in `web-bridge-research.md`, UNVERIFIED); a page served by `zinc dev` on the same loopback origin is the expected no-prompt case, not yet tested. Safari and loopback is UNVERIFIED.

**3d, animation, mapping, three.** `zinc:3d` is not bridged on purpose. `three` already runs the real three.js, which is the web answer for new code; the 14 demos use `zinc:3d` directly. The wasm route keeps pixels identical to the native software path (D-style golden comparison possible) at the cost of CPU speed in the page; WebGL2 is faster but is a second renderer to keep in step. Item 1 should pick wasm first (S/M part) and measure.

**sqlite.** Today the whole database lives in memory and is saved to `localStorage` per path (about 3 MB). Saving `sqlite3_serialize` bytes to IndexedDB lifts the cap and keeps calls synchronous. OPFS with synchronous access handles only works in a worker in all browsers (UNVERIFIED), which breaks the synchronous call model, so it is not first choice.

**pdf.** Zinc's API is synchronous and PDFium is already the native engine, so PDFium as wasm keeps the semantics; pdf.js gives a smaller download and wide browser support but is promise-based and would need app changes or a facade. Decision left to the task that takes it; the size is the open question.

**markdown.** Output must match the native md4c tree for the app's theme; a JS library may differ on edge cases of GFM. Prefer md4c to wasm (needs a C-callable shim since the host file is C++).

**Hardware plugins (displays, device, imu, lvgl, boards).** The device simulator (`src/sim`, `devices/`, `zinc run --simulate`) is C++ and native; it is not a page. For a hosted demo the pragmatic order is: the page canvas as the display (already how `display-*` are seen on desktop emulators), an in-page frame/LED-grid skin for the board look (S each), `device` answering canned numbers, `imu` from DeviceMotion or keys, and `lvgl` as wasm so the widgets run in the page. Running `src/sim` itself in the page would be a separate large task (L, not assessed).

**gphoto2, ble, serial, midi.** All Chromium-first: WebUSB, Web Bluetooth and Web Serial are not shipped in Safari or (except Serial in Firefox 151+ and MIDI in Firefox 108+) in Firefox; a hosted demo should detect with `zinc:browser.supports` and show a "use Chrome or Edge" message. Real-device passes for serial, MIDI, gphoto2 are open (`backlog/later.md:740`); the mocks prove the code path only.

**Spotify and Sonos cloud.** Spotify's PKCE flow is meant for browsers and needs no secret, but the redirect URI must be https or a loopback IP literal; a hosted page works with its own https URL. Sonos has no browser path to speakers and its cloud API needs a server-side secret, so a hosted demo can only show sample data.

**Plugins that stay D.** carplay, ipod, link, ffi, devtools, webos, display-remote/fbdev/webos, remarkable (beyond a clock), process on a hosted page. The hosted demo should use `zinc:browser.supports`/`requireFeature` and `ZnUnsupported` to print one clear line each ("needs the desktop app"), as `examples/music` already does for UDP and `zinc:link`.

## Open points

- `zinc:storage` on the web: not found; `async-storage` and any program saving files depend on it (UNVERIFIED, check `lib/std` and `targets/web/runtime.js`).
- Whether Firefox 151+ Web Serial and the LNA behaviour in Chrome 142/147 match the sources in `web-bridge-research.md`: UNVERIFIED in this pass.
- Sizes of wasm builds (LVGL, PDFium, Jolt, QuickJS) have not been measured; the web budget is 3 MB boot and 40 MB download (`targets/capabilities.json`).
