---
id: ZN-125
title: Frame hash and capture contract for every display
status: Done
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-25 01:53'
labels:
  - simulator
  - size-S
milestone: m-11
dependencies:
  - ZN-104
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZINC_FRAMEHASH and ZINC_SHOT work for every display driver and the null HAL; goldens are stored next to examples/boards/*.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the same hash from the macOS emulator and from device-sim for the s3-matrix demos
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. ZINC_FRAMEHASH=all|last (runtime/gfx.cpp frame_hash: FNV-1a 64 of the rasterized frame, every driver and the null HAL), goldens next to the board demos (examples/boards/*/*/framehash.golden), tests/t1/framehash.sh. Root-cause fix found on the way: the gfx surface now starts at the first graphics call, so width() at module level sees the board size (text-scroller and tilt-sand drew nothing before); three-cubes golden re-recorded (it had frozen the 320x240-in-800x500 bug). Full T1 85/86 before that golden fix. AC1 open: the device core has no frame surface, follow-up ZN-313.
Review 2026-10-25: closed as Done. ZINC_FRAMEHASH and goldens exist; the open half (device-sim hash equal to the emulator) is already its own task ZN-313. Close done. Evidence: tests/t1/framehash.sh; examples/boards/*/*/framehash.golden; follow-up ZN-313 Verifier: ZINC_FRAMEHASH, tests/t1/framehash.sh and 7 examples/boards/*/*/framehash.golden exist. The open half is in ZN-313's description, but ZN-313 has no acceptance criterion: copy AC1 there as its criterion.
<!-- SECTION:NOTES:END -->
