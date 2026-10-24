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
  - parked
milestone: m-23
dependencies:
  - ZN-492
  - ZN-503
ordinal: 94700
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
