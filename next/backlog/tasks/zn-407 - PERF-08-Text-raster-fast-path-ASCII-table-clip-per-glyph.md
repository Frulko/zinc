---
id: ZN-407
title: 'PERF-08 Text raster fast path (ASCII table, clip per glyph)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
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
- [ ] #1 b3-text <= 0.5 ms on 1 thread
- [ ] #2 pixel goldens of text demos identical
<!-- AC:END -->
