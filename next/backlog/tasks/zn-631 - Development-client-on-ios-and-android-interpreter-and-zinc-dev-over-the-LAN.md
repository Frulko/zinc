---
id: ZN-631
title: 'Zinc Go: a player app on Android and iOS, QR code from zinc dev, Fast Refresh'
status: Backlog
assignee: []
created_date: '2026-10-10 14:08'
updated_date: '2026-10-16 20:14'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-625
  - ZN-628
  - ZN-742
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A debug build of the app entry with the interpreter that loads bytecode from `zinc dev`; refused in release builds; QuickJS engine linked statically (WebGL module included, no `dlopen`) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a save on the desktop reloads the app on the emulator
- [ ] #2 a release export contains no reload code (`nm`)
- [ ] #3 the store policy of each mode is in `docs/guide`
- [ ] #4 zinc dev shows a QR code; Zinc Go on the Nexus 7 scans it and runs rn-showcase from the Mac over the Wi-Fi; a save of a .tsx on the Mac updates the screen on the tablet in under a second with state kept (Fast Refresh)
- [ ] #5 the same on the iOS simulator (URL or deep link instead of the camera)
- [ ] #6 a program asking for a plugin the player does not have shows the plugin's name, nothing crashes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner 2026-10-16 (the whole goal of this task now): at the end of the Android and iOS work, ship an app like Expo Go: one installed app with the most plugins linked in (everything that builds for the platform: ui, kits, net, sonos, spotify, socket, svg, lottie, canvas2d, three/zinc:gl, camera, async-storage, gsap...), the interpreter and QuickJS, which runs a project's TypeScript straight from the developer's machine: `zinc dev` prints a QR code (URL of the dev server on the LAN, as `expo start` does), the app scans it with the camera (zinc:camera) or takes the URL typed or from a deep link (zinc://...), downloads the program, runs it, and keeps it live with the Fast Refresh of ZN-742 (a save on the desktop swaps the changed modules in the running app, state kept). A program that needs a plugin the player lacks gets a clear message naming it. Release builds of a user's own app stay AOT and contain none of this (store rules, D59). References: Expo Go and expo start (QR, LAN/tunnel, dev menu by shaking), LÖVE's player APK, Flutter's hot reload.
<!-- SECTION:NOTES:END -->
