---
id: ZN-313
title: >-
  Device-sim core draws a frame: ZINC_FRAMEHASH equals the macOS emulator on the
  s3-matrix demos
status: Backlog
assignee: []
created_date: '2026-10-07 14:15'
updated_date: '2026-10-24 23:58'
labels:
  - sim
  - tests
dependencies:
  - ZN-125
ordinal: 1100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Add the acceptance criteria: the three board demos of examples/boards hash equal to framehash.golden on src/sim; low priority, after the Mac showcase.

ZN-125 left AC1's device-sim half open: src/dev core has no graphics (UART only). Give the device core a frame surface (zrt gfx on the core, board size), run the s3-matrix demos on it and compare ZINC_FRAMEHASH with examples/boards/*/*/framehash.golden.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the same hash from the macOS emulator and from device-sim for the s3-matrix demos (from ZN-125)
- [ ] #2 the s3-matrix demos run in a window with tilt from the mouse, and zinc:imu is in the early module check (from ZN-131)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. No criteria and ZN-125 (the parent) is in Review; the frame surface on the device-sim core is a nice parity check but few users see it.
Review 2026-10-25: merged ZN-131 here (device-sim with board presets). Carry over: (review-close proposed, corrected by the verifier) The early missing-module refusal is done (tests/t1/device_modules.sh). The other half, s3-matrix in a window with tilt from the mouse (and zinc:imu in the early check), is not in ZN-313: its description covers only a frame surface and the framehash, with no AC and no mention of a window or tilt. Closing as proposed loses it.
From ZN-131: The early missing-module refusal is done (tests/t1/device_modules.sh). The other half, s3-matrix in a window with tilt from the mouse (and zinc:imu in the early check), is not in ZN-313: its description covers only a frame surface and the framehash, with no AC and no mention of a window or tilt. Closing as proposed loses it.
<!-- SECTION:NOTES:END -->
