---
id: ZN-580
title: 'Demo: three.js game with FPS gates'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-566
  - ZN-567
  - ZN-411
  - ZN-568
  - ZN-569
  - ZN-573
  - ZN-574
  - ZN-576
ordinal: 359270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/games/three-arena: a third-person controller over a textured glTF level, 200 dynamic meshes, a directional light with shadows, positional audio, gamepad and keyboard, a HUD. Real three.js r186 on QuickJS (measured today ~27 us of JS per mesh, ~550 meshes at 60 fps). The native-tier counterpart is ZN-563 (the Zinc subset of three on the GPU through ZN-562 zinc:gl); ZN-543's native accelerators may lift the JS cost. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 three.js r186 unmodified
- [ ] #2 >= 60 fps at 1280x720 with >= 200 draw calls and shadows, p95 <= 16.7 ms
- [ ] #3 the glTF textures are visible
- [ ] #4 antialiased edges
- [ ] #5 a T1 test runs 300 frames headless
<!-- AC:END -->
