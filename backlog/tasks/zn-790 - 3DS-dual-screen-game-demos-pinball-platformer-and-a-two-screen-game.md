---
id: ZN-790
title: '3DS dual-screen game demos: pinball, platformer and a two-screen game'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:40'
updated_date: '2026-10-25 00:13'
labels:
  - ui
dependencies: []
ordinal: 524460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three demos made for the 3DS that play on both screens at once: the pinball and the platformer reworked for the top and bottom screens, and a third game built around the two screens and the touch screen. Each runs on the GPU path, works in Azahar and is copied to the SD card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pinball on both screens: table across them, the ball crossing, flippers on L/R, d-pad, A and the touch screen
- [x] #2 Platformer on both screens: level on top in 3D, map, HUD and stylus look-around below
- [x] #3 An original two-screen stylus game (Starfall)
- [x] #4 Each runs in Azahar on the GPU path with no software fallback, program time p99 under 16 ms
- [x] #5 Headless sessions in tests/t1/n3ds_demos.sh; .3dsx built in ~/Documents/3ds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
examples/n3ds-pinball (Nova Patrol DS), examples/n3ds-platformer (Meadow Run 3D), examples/n3ds-starfall (Starfall), shared helpers in examples/n3ds-kit/stereo.ts (Eyes, ProgramTime). Azahar, 3D on (ZINC_3D_SLIDER=1), program time per refresh (both eyes + bottom screen): pinball p50 8 / p99 12 ms (first-frame art bake 0.6 s), platformer 7 / 9 ms, starfall 2 / 3 ms; no 'gpu replay ... software' line in any run. ZINC_PROFILE work includes the bottom window's C3D_FrameBegin vblank wait, hence ProgramTime. Test: tests/t1/n3ds_demos.sh (interpreter goldens, QuickJS frame 200 for platformer and starfall, starfall zinc test). Pinball does not run on QuickJS (examples/pinball imports zinc:platform TOUCH, missing there). .3dsx: ~/Documents/3ds/n3ds-{pinball,platformer,starfall}.3dsx (tools/console-demos).
<!-- SECTION:NOTES:END -->
