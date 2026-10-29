# Plugin documentation audit

67 plugins, one file each in this folder (all of `plugins/` is covered, none missing). Scores 0-5 are the auditors' judgement, not a measure. (hw) = needs hardware, (owner) = needs the owner.

| Plugin | Score | Status | Top missing | File |
|---|---|---|---|---|
| async-storage | 1 | no doc | page (path listed in affected.json but missing), API table, quick start | [async-storage.md](async-storage.md) |
| display-webos | 1 | no user doc | user page, install tutorial (hw), options table | [display-webos.md](display-webos.md) |
| gestures | 1 | no doc | plugin page, field/threshold table, test and example | [gestures.md](gestures.md) |
| imu-qmi8658 | 1 | boards.md section only | own page with API table, tilt-sand screenshots, calibration tutorial (hw) | [imu-qmi8658.md](imu-qmi8658.md) |
| pixelfont | 1 | no doc | docs/plugins page, glyph sheet image, scroll-text tutorial | [pixelfont.md](pixelfont.md) |
| browser | 2 | only in targets/web.md | own page, feature-key table from browsers.json, banner screenshot | [browser.md](browser.md) |
| device | 2 | boards.md section only | own page with API table, link existing screenshot, calibration tutorial (hw) | [device.md](device.md) |
| ink | 2 | scattered | own page, API and tool table, notebook tutorial (Marker test hw) | [ink.md](ink.md) |
| ipod | 2 | stale README, no mount | mount/eject in demo and API, demo screenshots, typed API table | [ipod.md](ipod.md) |
| svg | 2 | stale targets | targets table (android, ios, windows, web), link svg-gallery.png, tutorial | [svg.md](svg.md) |
| webos | 2 | no page, no test | plugin page, TouchPad tutorial (hw), T0 test of fallback | [webos.md](webos.md) |
| carplay | 2.5 | README only | docs/plugins page, declare requires, setup tutorial (hw), fix ZN-851 | [carplay.md](carplay.md) |
| display-scrollphat | 2.5 | boards.md only | emulator screenshots, displays.md section with wiring, tutorial | [display-scrollphat.md](display-scrollphat.md) |
| display-ssd1306 | 2.5 | section, no images | screenshots, OLED clock tutorial, troubleshooting (0x3C/0x3D, flip) | [display-ssd1306.md](display-ssd1306.md) |
| animation | 3 | no visuals | screenshot/GIF, Blender tutorial, API table | [animation.md](animation.md) |
| camera | 3 | doc contradicts code | scanQr docs, webcam screenshots, real camera proof (hw); fix image prop | [camera.md](camera.md) |
| canvas2d | 3 | no screenshot | sketch screenshot, lessons 17-20 link, web target and limits | [canvas2d.md](canvas2d.md) |
| devtools | 3 | in dev-mode.md | panel screenshots, plugin page, troubleshooting | [devtools.md](devtools.md) |
| display-gl | 3 | thin reference | renderer option, webOS row, ZN_GL env table | [display-gl.md](display-gl.md) |
| display-st7789 | 3 | good boards.md | symptom table, pin recipes per module, tutorial (hw) | [display-st7789.md](display-st7789.md) |
| ffi | 3 | doc contradicts code | fix libffi section, Library methods, example and tutorial | [ffi.md](ffi.md) |
| gphoto2 | 3 | no real camera | screenshot, tethered tutorial, real body test (hw) | [gphoto2.md](gphoto2.md) |
| lan | 3 | no API table | API table, lan-arena screenshot, broadcast tutorial | [lan.md](lan.md) |
| leapmotion | 3 | no visuals | demo screenshots, API tables, tutorial | [leapmotion.md](leapmotion.md) |
| loader | 3 | manifest ahead of truth | screenshots, tutorial and demo, target honesty (ZN-447) | [loader.md](loader.md) |
| markdown | 3 | no visuals | screenshot, Node/FLAG table, README-render tutorial | [markdown.md](markdown.md) |
| microphone | 3 | no example | examples/microphone, tutorial, real hardware proof | [microphone.md](microphone.md) |
| midi | 3 | no visuals | screenshot, sound in example (ZN-715), tutorial | [midi.md](midi.md) |
| network | 3 | no example | Wi-Fi page screenshot, picker tutorial, troubleshooting table | [network.md](network.md) |
| pdf | 3 | README only | docs/plugins page, full API, packaging notes | [pdf.md](pdf.md) |
| photos | 3 | no visuals | screenshots, verified-where paragraph, grid tutorial | [photos.md](photos.md) |
| process | 3 | stale example | screenshot, dedicated test, build-button tutorial | [process.md](process.md) |
| qrcode | 3 | no visuals | screenshot, zinc:ui snippet, capacity table | [qrcode.md](qrcode.md) |
| remarkable | 3 | README only | plugin page with API table, screenshots, first-app tutorial | [remarkable.md](remarkable.md) |
| remote-view | 3 | no test mapping | viewer screenshot, key table, Session.view API, secure-watch tutorial | [remote-view.md](remote-view.md) |
| sonos | 3 | stale test claim | no-speaker mode, remote tutorial, discovery troubleshooting | [sonos.md](sonos.md) |
| spotify | 3 | API undocumented | missing API, fake Spotify, login tutorial | [spotify.md](spotify.md) |
| sprite | 3 | examples unnamed | examples, walking-hero tutorial, rule options | [sprite.md](sprite.md) |
| sqlite | 3 | FTS5 missing | FTS5 section, full target list, screenshot/tutorial | [sqlite.md](sqlite.md) |
| system | 3 | stale stub note | per-module API pages, screenshots (owner), menu-bar tutorial | [system.md](system.md) |
| three | 3 | stale claims | screenshots, web entry and importmap, unsupported-features table | [three.md](three.md) |
| tilemap | 3 | no visuals | LDtk screenshot, first-level tutorial, importer limits | [tilemap.md](tilemap.md) |
| wasm | 3 | stale | QuickJS WebAssembly pack, example, stale prototype refs | [wasm.md](wasm.md) |
| display-fbdev | 3.5 | no setup path | Pi tutorial (hw), Pi screenshot, troubleshooting table | [display-fbdev.md](display-fbdev.md) |
| display-rmpp | 3.5 | no per-driver ref | options/env table, plugin page, e-ink tutorial (hw) | [display-rmpp.md](display-rmpp.md) |
| display-ws2812 | 3.5 | no images | matrix screenshots/GIF, troubleshooting, power guide (owner) | [display-ws2812.md](display-ws2812.md) |
| loro | 3.5 | no example | examples/collab-notes, sync tutorial, troubleshooting | [loro.md](loro.md) |
| lvgl | 3.5 | API partial | generated full API table, step tutorial, targets table | [lvgl.md](lvgl.md) |
| socket | 3.5 | doc contradicts manifest | chat tutorial, WebSocketServer docs, troubleshooting | [socket.md](socket.md) |
| 3d | 4 | good | link screenshots, first-scene tutorial, Fog docs | [3d.md](3d.md) |
| audio | 4 | good | no-sound troubleshooting, first-sound tutorial, example (ZN-715) | [audio.md](audio.md) |
| ble | 4 | good | screenshot, chat tutorial (hw), throughput (hw) | [ble.md](ble.md) |
| display-remote | 4 | good | viewer screenshot, Pi watch tutorial (hw), example README | [display-remote.md](display-remote.md) |
| gsap | 4 | good | on-screen example, ease cheat-sheet, API table | [gsap.md](gsap.md) |
| location | 4 | good | geo screenshot, distance tutorial, Watch docs | [location.md](location.md) |
| lottie | 4 | good | link gallery, tutorial, targets table | [lottie.md](lottie.md) |
| map | 4 | good | screenshot/GIF, MapView API table, offline tutorial | [map.md](map.md) |
| mapping | 4 | good | editor screenshots (owner), facade tutorial, API table | [mapping.md](mapping.md) |
| osc | 4 | good | screenshot, TouchOSC tutorial, web section | [osc.md](osc.md) |
| physics2d | 4 | good | standalone demo, flipper tutorial, API gaps | [physics2d.md](physics2d.md) |
| physics3d | 4 | good | screenshot, Contact/Hit/Constraint API, tutorial | [physics3d.md](physics3d.md) |
| script | 4 | stale prototype refs | remove prototype refs, mod tutorial, embed screenshots | [script.md](script.md) |
| serial | 4 | good | plot screenshot, potentiometer tutorial (hw), Web Serial | [serial.md](serial.md) |
| video | 4 | good | no-audio notice on top, typed API table, embed captures | [video.md](video.md) |
| webview | 4 | good | screenshots, tutorial and window.zinc d.ts, troubleshooting | [webview.md](webview.md) |
| link | 4.5 | strong | pairing GIF, pair tutorial, iOS/troubleshooting | [link.md](link.md) |
| webrtc | 4.5 | very complete | embed screenshots, chat tutorial, TURN guide | [webrtc.md](webrtc.md) |

## Gaps that recur

- Screenshots: almost no plugin page embeds one; many exist in `docs/img` or `examples/*/screenshots` unlinked (3d, svg, lottie, webcam, video). None at all for ws2812, ssd1306, scrollphat, remote.
- Tutorials: nearly every plugin lacks a step-by-step page; graded 3 or below mostly for this.
- No own page: webos, display-webos, pixelfont, gestures, async-storage, ink, browser, device, imu, carplay, pdf, remarkable, display-rmpp and the small displays live in boards.md, targets or a README.
- API tables by hand and partial (lvgl names under half of 158 exports, ipod, ffi, physics, map); should be generated from the d.ts.
- Stale claims: removed Node prototype (`compiler/`, node:vm sim) in script, wasm, svg, process, sqlite, socket; 'verified on x86_64' though the machine is now arm64; target tables missing windows/web/android/ios versus `plugin.json`.
- Doc contradicts code: camera (`image` prop, 'future' mic/QR), ffi (libffi), socket (requires), sonos/spotify ('no test'), webrtc and canvas2d web status.
- Tests not mapped in `tests/affected.json`: display_drivers, test_map, remote-view, ffi, async-storage, webos.

## Proposed order of work (once `zinc doc` accepts plugin pages)

1. Generate API tables from d.ts/plugin.json for all plugins (fixes target and stale-type rows in one pass).
2. Stale/contradicting fixes (cheap, no hardware): camera, ffi, socket, sonos, spotify, script, wasm, svg, process, sqlite, webrtc, canvas2d.
3. Missing pages for the most used plugins and showcase demos: async-storage, sqlite, audio/video/ipod, ui plugins (markdown, pdf, ink, gestures, browser, devtools, map), 3d/three/canvas2d/svg/lottie, then screenshots from existing examples (`ZINC_SHOT`, `ZINC_BACKGROUND=1`).
4. Simulator-only tutorials: displays (emulator windows), network (loopback), loro, osc, link.
5. Pages for small items: pixelfont, imu, device, display-webos, carplay, remarkable.
6. Apart: hardware (hw) steps: Pi, ESP32, OLED, LEDs, CarPlay, TouchPad, reMarkable Marker, real cameras, iPhone; owner items: system screenshots, mapping editor shots, ws2812 power guide.

Related request: iPod mount/unmount in `examples/ipod` needs a new `mount()` in the plugin (`diskutil mount`, `udisksctl mount`), an Eject button (`eject()` exists) and a disk-mode guide; not yet done.
