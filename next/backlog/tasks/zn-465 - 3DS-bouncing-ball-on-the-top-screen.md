---
id: ZN-465
title: '3DS: bouncing-ball on the top screen'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - 3ds
  - handheld
  - handhelds
  - perf
  - size-M
milestone: m-23
dependencies:
  - ZN-460
ordinal: 300120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Software raster into a linear buffer, GX_DisplayTransfer (or a rotated copy) into the top LCD framebuffer, vblank swap; Old and New 3DS clocks; ARMv6 SIMD in blend loops if the profile shows them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/bouncing-ball runs unchanged in Azahar; a RetroArch --max-frames-ss screenshot matches the host render with the rotation handled
- [ ] #2 maximum ball count at 60 fps recorded for Old and New 3DS settings (hardware when available) with a 90 % gate
<!-- AC:END -->
