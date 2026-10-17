---
id: ZN-631
title: 'Zinc Go: a player app on Android and iOS, QR code from zinc dev, Fast Refresh'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-10 14:08'
updated_date: '2026-10-17 02:53'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-625
  - ZN-628
  - ZN-742
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A debug build of the app entry with the interpreter that loads bytecode from `zinc dev`; refused in release builds; QuickJS engine linked statically (WebGL module included, no `dlopen`) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a save on the desktop reloads the app on the emulator
- [x] #2 a release export contains no reload code (`nm`)
- [x] #3 the store policy of each mode is in `docs/guide`
- [ ] #4 zinc dev shows a QR code; Zinc Go on the Nexus 7 scans it and runs rn-showcase from the Mac over the Wi-Fi; a save of a .tsx on the Mac updates the screen on the tablet in under a second with state kept (Fast Refresh)
- [x] #5 the same on the iOS simulator (URL or deep link instead of the camera)
- [x] #6 a program asking for a plugin the player does not have shows the plugin's name, nothing crashes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner 2026-10-16 (the whole goal of this task now): at the end of the Android and iOS work, ship an app like Expo Go: one installed app with the most plugins linked in (everything that builds for the platform: ui, kits, net, sonos, spotify, socket, svg, lottie, canvas2d, three/zinc:gl, camera, async-storage, gsap...), the interpreter and QuickJS, which runs a project's TypeScript straight from the developer's machine: `zinc dev` prints a QR code (URL of the dev server on the LAN, as `expo start` does), the app scans it with the camera (zinc:camera) or takes the URL typed or from a deep link (zinc://...), downloads the program, runs it, and keeps it live with the Fast Refresh of ZN-742 (a save on the desktop swaps the changed modules in the running app, state kept). A program that needs a plugin the player lacks gets a clear message naming it. Release builds of a user's own app stay AOT and contain none of this (store rules, D59). References: Expo Go and expo start (QR, LAN/tunnel, dev menu by shaking), LÖVE's player APK, Flutter's hot reload.

2026-10-17 (worktree agent): built and proven, report docs/reports/zinc-next-zinc-go.md.
- Zinc Go = examples/zinc-go exported with zinc.json "player": true: the home screen as a hot unit (zinc/home.unit), every plugin with native code and a phone entry linked and registered (player_modules.cpp), zn_app_player (src/app/player.cpp + src/dev/hot_swap.cpp + the interpreter). zinc dev --lan prints a QR code (qrcodegen 1.8.0, MIT) and zinc://ip:port/code, compiles hot units per phone profile (zinc --emit=hot, without the optimiser), sends them on connect and on each save; the player swaps them between ticks (hot::plan/swap) or restarts in-process; console lines come back to the terminal. Dev menu: Menu key, Cmd+D, three fingers 0.8 s, a shake -> SDL_ShowMessageBox (Reload, Go home). A missing plugin is named on the home screen and in zinc dev, the link stays. Scanner: zinc:camera scanQr (quirc 1.2, ISC, plugins/camera/vendor/quirc); the fake camera holds a picture with ZINC_FAKE_CAMERA_IMAGE. React model Fast Refresh (lib/std/react.ts): the whole tree renders again after an update, hook state kept, memos recomputed, effects not run again.
- Proven: tests/t2/zinc_go_phones.sh on the API 37 emulator (deep link to 10.0.2.2, Forms tab and checkbox tapped, Forms.tsx saved: refreshed 854 ms after the save, compile 628, device 51; checkbox still ticked, new heading) and the iOS 26.3 simulator (launch link, refreshed 725 ms, new heading). By hand on the emulator: the dev menu's Reload and Go home, the home screen's Open through the system opener back into the player, the messages for a wrong code and a stopped zinc dev. tests/t1/zinc_go.sh (desktop player: QR, wrong code, swap with state kept, restart, React refresh, missing plugin), tests/t1/zinc_go_home.sh (fake camera QR -> scan -> opener), tests/t0/qr_code.sh, export_android (player export; no player in a user's app), app_library (nm: no swap, player or interpreter in a user's app archives and in rn-showcase's binary). Passing too: hot_off, hot_swap, fast_refresh, dev_mode, asset_reload, export_ios, plugin_manifest, camera, webcam, webcam_sim, webcam_demo, camera_pixels.
- Fixed on the way: camera.android.cpp never compiled (Cam and cams defined twice with camera.host.cpp); a program the player starts did not hear the safe area (zn_hal_sdl_resignal).
- Decision (to number): programs for a player are compiled on the developer's machine and sent as hot units (Expo's model), scored 66 against the compiler on the phone 46 and a process per program 45; units without the optimiser (770 -> 570 ms per save on rn-showcase). Full text: the report §2.
- Not in the player yet: QuickJS (.js projects) and zinc:gl/three (ZN_WEBGL is off in phone exports); later.md lines in the final report.
- AC #4 open, status Review: the scan on the Nexus 7 over Wi-Fi was not run (the owner's music app is in front; the brief said not to use it). The rest of #4 is proven on the emulator (QR printed, deep link instead of the camera, refresh under a second with state kept) and the camera scan on the desktop's fake camera. Next, on a free Android device: `zinc export ../examples/zinc-go --target android --apk --abis armeabi-v7a`, `adb -s <serial> install -r <apk>`, `zinc dev ../examples/rn-showcase --lan`, scan the terminal's code with Zinc Go, save a .tsx.
<!-- SECTION:NOTES:END -->
