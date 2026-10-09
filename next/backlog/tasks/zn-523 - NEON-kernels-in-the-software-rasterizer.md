---
id: ZN-523
title: NEON kernels in the software rasterizer
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 320110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NEON intrinsics for span fill, source-over blend, XRGB8888 to RGB565 conversion and glyph blits, compiled for armv7 NEON targets and bit-exact with the scalar path; no +neonfp (denormal flush would break interpreter/AOT/host bit-exactness). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the pixel corpus gives identical CRCs with and without the NEON kernels under qemu-arm -cpu cortex-a8 or the CHIP-03 simulator
- [ ] #2 a microbenchmark of the four kernels is added to next/bench
- [ ] #3 on hardware fill and conversion are at least 2x faster than scalar
<!-- AC:END -->
