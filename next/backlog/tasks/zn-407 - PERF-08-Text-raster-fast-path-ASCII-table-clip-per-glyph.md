---
id: ZN-407
title: 'PERF-08 Text raster fast path (ASCII table, clip per glyph)'
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:19'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
raster.cpp:290 glyph_of binary-searches per code point and draw_text (:325) tests the clip per pixel. b3-text: 250 commands 0.96 ms on 1 thread. Add a 128-entry ASCII table per baked font and test the clip once per glyph box, with an unchecked inner loop when inside.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 b3-text <= 0.5 ms on 1 thread
- [x] #2 pixel goldens of text demos identical
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
glyph_of reads ASCII code points of the first 64 baked fonts from a 128-entry table built on first use (release/acquire flag; concurrent builders write the same values); draw_text clips each glyph box once and runs an unchecked inner loop (alpha 255 keeps the coverage as is, else the same cov * alpha / 255).
Measured b3-text (1000x640, 1 thread, bench of the scene dump): 0.65 -> 0.39 ms median, hash 034d648982ff76f7 unchanged.
Tests: tests/run --changed 44/44, canary 4/4 (text, kit-gallery, hero, iot-panel), framehash, text_shaped, canvas, svg_lottie.
Note: the ld 'duplicate libraries' warning when linking zinc comes from 8c67fb5d (allocator dependencies in CMakeLists, another session), not from this task.
usage: n/a
<!-- SECTION:NOTES:END -->
