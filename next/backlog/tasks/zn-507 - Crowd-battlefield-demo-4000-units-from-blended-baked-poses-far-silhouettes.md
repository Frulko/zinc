---
id: ZN-507
title: 'Crowd battlefield demo: 4,000 units from blended baked poses, far silhouettes'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-494
  - ZN-496
ordinal: 300540
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Requiem-class crowd: about 4,000 units in cohorts on a 2 km field, motion baked as placed pose frames, each unit drawn as a blend of two frames (GE morph on PSP, vertex-program blend on PICA and GXM), cheap silhouettes at distance on the smaller machines, cohort-level culling. Target: up to 1,750 units visible at 30 fps on Vita; record PSP and 3DS rates. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vita hardware receipt: 30 fps with >= 1,500 units in view on the tape
- [ ] #2 PSP and 3DS receipts with units in view and fps recorded
- [ ] #3 Emulator goldens for one frame per target
<!-- AC:END -->
