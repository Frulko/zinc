---
id: ZN-760
title: 'PS2 zinc:3d on the GS: gsKit triangles, then AthenaEnv''s VU1 microprograms'
status: Backlog
assignee: []
created_date: '2026-10-17 10:51'
labels:
  - handheld
  - games
  - size-L
  - parked
milestone: m-23
dependencies:
  - ZN-197
  - ZN-489
ordinal: 94100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: the consoles draw 3D on their GPUs, built on existing code and Pocket3D's methods (D144). PS2: stage 1, render3d's CPU front half (transform, per-vertex light, clip) feeding GS triangles through gsKit (AFL-2.0) with ps2sdk packet2; stage 2, VU1 transform and lighting with AthenaEnv's MIT microprograms (src/vu1/*.vsm at 359485433f, attributed), our own packet code. Textures in the cooker's PS2 layout (CLUT4/CLUT8, GS-friendly sizes), 640x448 (PAL 640x512 centred, as ZN-753 does), f32 numbers. References: docs/reports/games/console-2d-3d-frameworks.md (PS2 column), docs/reports/games/pocket3d-hardware-adaptation.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/marble (low pieces) draws on the GS in PCSX2 with the same scene as the desktop at 640x448 (screenshot and frame times in docs/reports/zinc-next-consoles.md)
- [ ] #2 stage 2 (VU1) is measured against stage 1 on the same scene, and the faster one is the default
- [ ] #3 a T0 test checks the packet stream of one cooked mesh against a golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. PS2 3D on the GS (gsKit then VU1) is a large task on a console far from the goal; depends on the parked ZN-197 and ZN-489. Reopen when the owner wants PS2 3D.
<!-- SECTION:NOTES:END -->
