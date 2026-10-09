---
id: ZN-487
title: 'Demo: PocketJS Hero on PSP in PPSSPP (examples/pocket-hero)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-463
ordinal: 300340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First demo. Build examples/pocket-hero (the PocketJS Hero compiled by Zinc through lib/compat/pocketjs) for psp, 480x272, and run it in PPSSPPHeadless with the software raster present. Record frame work against PocketJS's published numbers (Hero, Solid, PPSSPP: JS 2,147 us, average work 3,663 us). (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pocket-hero renders in PPSSPP and its frame N matches the psp-profile simulator byte for byte
- [ ] #2 Focus navigation with the d-pad and a press with Cross change the state in a scripted run (goldens before and after)
- [ ] #3 Frame work per frame is logged and compared with the PocketJS numbers in the task notes
- [ ] #4 A screenshot is added to docs/targets/psp.md
<!-- AC:END -->
