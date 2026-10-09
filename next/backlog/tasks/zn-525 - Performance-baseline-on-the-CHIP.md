---
id: ZN-525
title: Performance baseline on the CHIP
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
  - ZN-523
ordinal: 320130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measure on hardware with ZINC_PROFILE and the display stats: bouncing-ball balls at 60 and 30 fps (interpreter, QuickJS, AOT), kit-gallery full-screen motion, hero navigation, start-up time and RSS, for the PocketCHIP LCD, composite and the HDMI DIP; compare -marm/-mthumb and the f64 profile with an f32 variant; replace the estimates of docs/reports/hardware/ntc-chip.md 9.5 and add chip thresholds to the bench gate. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the table of section 9.5 holds measured numbers with board, kernel and clock
- [ ] #2 f64 versus f32 and ARM versus Thumb-2 results recorded with a recommendation
- [ ] #3 bench-gate has chip thresholds
- [ ] #4 runs discarded when the AXP209 reports an input-limit event
<!-- AC:END -->
