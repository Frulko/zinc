---
id: ZN-523
title: 'NEON kernels for fill, blend, RGB565 conversion and glyph blits'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 53200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Add the four kernels bit-exact with scalar (CRC test under qemu-arm cortex-a8), a bench entry; measure on the Pi 3B+ in 32-bit userland.

NEON intrinsics for span fill, source-over blend, XRGB8888 to RGB565 conversion and glyph blits, compiled for armv7 NEON targets and bit-exact with the scalar path; no +neonfp (denormal flush would break interpreter/AOT/host bit-exactness). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the pixel corpus gives identical CRCs with and without the NEON kernels under qemu-arm -cpu cortex-a8 or the CHIP-03 simulator
- [ ] #2 a microbenchmark of the four kernels is added to bench
- [ ] #3 on hardware fill and conversion are at least 2x faster than scalar
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. NEON in the rasterizer is partly there (runtime/raster.cpp:15,898 bilinear and opaque picture paths; commit fb31e083). Missing: span fill, source-over blend, XRGB to RGB565 conversion in display-fbdev, glyph blits, and a microbenchmark. Pi 2/3 on 32-bit OS benefit too. Evidence: runtime/raster.cpp:898; plugins/display-fbdev/fbdev.cpp has no arm_neon
<!-- SECTION:NOTES:END -->
