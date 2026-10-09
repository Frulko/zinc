---
id: ZN-406
title: PERF-07 Stroke join discs from precomputed unit-circle tables
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
raster.cpp:730 stroke_contours calls cosf/sinf for every vertex of every join disc (6/10/16 segments); with sincosf it is ~12% of navigation AOT samples. Three static tables built once with the same expression give the same floats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no trigonometric call per join
- [ ] #2 contours bit-identical to the current ones (unit test over random polylines)
- [ ] #3 navigation AOT paint p50 -8% or better
<!-- AC:END -->
