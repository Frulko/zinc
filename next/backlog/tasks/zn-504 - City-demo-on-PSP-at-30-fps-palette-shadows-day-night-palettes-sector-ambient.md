---
id: ZN-504
title: >-
  City demo on PSP at 30 fps: palette shadows, day/night palettes, sector
  ambient
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-492
  - ZN-503
ordinal: 300510
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PSP city renderer: a worker thread sweeps the height field when the sun moves and sets bit 7 of ground indices in place (palette upper half = shaded lower half), the CPU mixes day and night palettes by the hour, walls drawn per compass sector with the GE ambient colour as light, near/far depth split, cell reader thread with prefetch, governor on distances, 2-vblank lock with 60 Hz logic. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hardware receipt: 150 s tour at 30 fps with <= 5 late frames, triangles and draws logged
- [ ] #2 PPSSPP goldens at three times of day
- [ ] #3 Shadows move with the clock (goldens at two sun positions differ only in shaded regions)
<!-- AC:END -->
