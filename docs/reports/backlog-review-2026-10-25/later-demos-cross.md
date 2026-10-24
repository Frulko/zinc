# Later.md review: Demos and Cross-platform pass (lines 555-968)

381 lines. Counts: drop 4, keep 140, promote 46, group 188, duplicate 3.

No line is `done`: nothing checked proved a line complete. Most Demos lines are small follow-ups of finished tasks and stay `keep`; the cross lines are grouped per target. A line that lists several targets sits in the first matching group.

## Promoted tasks (lane mac)

- **Re-skin pinball, pinball3d and pocket-hero with Kenney CC0 packs** (m-22, size M, 1 lines): pinball, pinball3d and pocket-hero use Kenney assets (CC0), credited in their README; Goldens and T1 tests of the three demos updated and passing; Assets adapted per platform through the asset pipeline (no new runtime code)

- **First-run polish of the CLI messages and guide (ZN-711 follow-ups)** (m-6, size M, 8 lines): A type error names the type as the user wrote it (number, not f64); One misspelt import gives one error with a did-you-mean; a bare npm specifier says npm packages are not loaded; `zinc new` with no argument asks or explains instead of building in the current directory; desktop-app template headless output is short; server template reads PORT; docs/guide/README.md and 01 describe the engine (no Docker, Node sim); tests/t0/plugin_manifest passes

- **React/RN layer gaps found by rn-showcase (ZN-718 follow-ups)** (m-5, size M, 9 lines): useEffect cleanup (returned function) runs on re-run and unmount (lib/std/react.ts never sets EffectHook.cleanup); A local component named like a host tag shadows it; `<ActivityIndicator />` with no props and a run-time `rotate` compile; View accepts pointerEvents and accessibilityLabel, TextInput placeholderTextColor; ui.onScroll drops dead watchers; DevTools DOM view shows <View className> names; inspector tests updated; one T1 test covers the set

- **Museum table update: non-blocking and checked before staging (ZN-650.11 follow-ups)** (m-27, size M, 4 lines): Check and download run off the frame (no blocking curl without timeout) in zinc:system/update; A published project that does not parse is refused before staging; zinc:process promises are awaited in deterministic runs so museum_update no longer races; zinc update-app works on a fused or exported table

- **The pinball starts with --engine quickjs** (m-15, size S, 1 lines): `zinc run examples/pinball --engine quickjs` renders frames (interface imported by name resolved); A short smoke in the pinball T1 test

- **Release hygiene for the engine packs (Hermes licences, pinned V8, .qbc version stamp, source-map paths)** (m-14, size S, 4 lines): Hermes pack carries the licences of libhermesvm vendored parts; tools/v8-pack pins the V8 version; .qbc is stamped with the zinc version and a mismatch recompiles; Source maps of a moved build resolve (sources embedded or absolute)

- **Web export fixes: asset build, sw.js scope, quiet unavailable modules, prerender wait** (m-14, size M, 5 lines): zinc export --target web runs the asset build so examples/platformer starts; sw.js cache is scoped by app name; zinc:sprite/link/udp answer unavailable quietly on the web; Exporting a raw template says "run zinc new first"; web_dom waits on the first frame, not 6 s

- **QuickJS and npm packages: Web globals, browser field, CommonJS, local Date, catch annotations** (m-14, size M, 5 lines): Packages reading crypto/TextEncoder/fetch/URL get the globals when linked; `browser` condition tried after module/main; CommonJS/UMD (dayjs) loads or the error says to run zinc bundle; Date local getters agree with the constructor zone (date-fns/dayjs/moment test); `catch (e: any)` parses

- **Lighter exported and idle UI apps: link only what is used, idle redraw, memory owners** (m-21, size L, 6 lines): A UI-only export with permissions [] links no TLS, libuv, llhttp or unused SDL3 subsystems; size compared with the Tauri row; An app with no animation or input sleeps until an event (idle hello below 1% CPU); Report names what holds the 25-90 MB RSS (atlas, fonts, tree, arenas) and the 14 threads; unused ones start lazily; Numbers logged in docs/reports/zinc-next-perf.md

- **devices/iphone.json and devices/android-phone.json for zinc run --simulate** (m-26, size S, 1 lines): Two device presets with safe-area insets, cutout and behaviour profile; A T1 smoke shows a layout with insets on the Mac

- **Fix two stale texts: zinc update message and AGENTS.md machine description** (m-19, size S, 2 lines): `zinc update` says to unpack the tar.gz or run install.sh again; AGENTS.md "The development machine" matches the real machine

## Groups (lane cross)

- **Cross-platform pass: Windows port, first run and checks** (m-11, 25 lines): zinc.exe and the host library build and link on Windows (libuv/SDL3 win backends, sys_host port, plugins as dll); windows-cross and windows-console CI jobs green, continue-on-error removed; zinc tour/new/device/dev, loadFont drive paths, live resize, taskbar name checked on a Windows machine; Installer (install.ps1, zip, winget) and signing path run once

- **Cross-platform pass: Linux x86_64 and aarch64 desktop and release archives** (m-11, 40 lines): tools/build-linux archives (aarch64, armhf, x86_64, musl) run on Ubuntu/Wayland machines; install.sh on Ubuntu, Debian, Fedora; Listed tests (module_resolution, assets, assets_groups, physics2d/3d, zpk, tilemap, osc/serial/midi, canvas2d, bundle) pass on Linux x86_64 and arm64; V8, JSC, Hermes and wasm packs build and run on Linux; .deb export and verify; Release job publishes the Linux archives

- **Cross-platform pass: Raspberry Pi and ARM boards on the rig** (m-25, 49 lines): Pi 3B+ session: image first boot, signed update with rollback, dev --device handoff, agent install as a service; GLES 2 renderer: frame times, stalls, hero map and museum film on Pi 3 (and Pi 4/5 if available); Pi 1/Zero armhf start time and memory; fbdev pacing; splash timing; Results in docs/reports/raspberry-pi.md and zinc-next-perf.md

- **Cross-platform pass: ESP32 boards (LVGL panel, emulator, strict profile)** (m-18, 7 lines): zinc:lvgl on ESP32-2432S022: Bench, Lottie and Input pages measured, JOIN_SLACK and LCD_HZ settled; --emulator/--live on Linux and Windows; esp32 core rebuilt with gfxGradientPaint; async-storage mergeItem on the strict profile; 8-tween budget

- **Cross-platform pass: handhelds and old tablets (PSP, Vita, 3DS, PS2, TouchPad, Nexus 7)** (m-23, 16 lines): PSP, Vita, 3DS, PS2 on hardware or emulators: breakout/Meadow Run/Marble frame times, GE and citro3d replay measures, input and sensors; TouchPad/Nexus 7: screen-off, SSDP, zinc:stage music-tree, webOS strip, zinc:link pairing; Linux CI for the console runners

- **Cross-platform pass: Android and iOS on real phones** (m-26, 32 lines): Android (Nexus 7, recent phone) and iPhone: insets, theme, IME, haptics, predictive back, fling feel, font, video, accessibility; arm64-v8a/x86_64 emulator smoke run; --aab/--apk on Linux; IPA with the owner team; Camera and microphone backends run on both

- **Cross-platform pass: peripherals on real hardware (camera, microphone, serial, MIDI, gamepad, WebRTC, LeapMotion)** (m-14, 19 lines): Each plugin tried with real hardware on the Mac (camera, mic, Arduino serial, MIDI keyboard, gamepads) and results noted; Linux/Windows/Android/iOS backends build and run (V4L2, Media Foundation, camera2, WASAPI); WebRTC builds on Linux/armhf and runs between two machines

## Notable drops and duplicates

- Drop 556 (ZN-775 heartbeats, task Done, no user); 584 (ZN-698 hash, pinball no longer needs it; decide the task itself in the Backlog review); 895 and 945 (CI flakes; policy: skip flaky CI tests).
- Duplicates: 886 = ZN-361.01, 870 = ZN-632, 851 = line 827.

## Notes

- Demos lines left `keep` cluster by parent: ZN-650.* museum table (about 40), ZN-649.* pinball editor (about 12), ZN-570/572/573/574 JS-library work, ZN-712 JS demos, ZN-757/758 notify-relay. Attach them to their parent task notes at the backlog review rather than make tasks.
- Parent tasks still open (ZN-570, 572, 574, 713, 718, 725, 731...) own some lines; they were not marked duplicate because the lines go beyond the criteria.
- Verified: lib/std/react.ts never sets EffectHook.cleanup (lines 9, 70, 123); tests/t0/plugin_manifest.sh fails here; docs/guide/01 and 04 still mention Docker; no Kenney asset in pinball, pinball3d, pocket-hero.
