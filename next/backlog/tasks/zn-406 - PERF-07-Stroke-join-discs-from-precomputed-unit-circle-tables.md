---
id: ZN-406
title: PERF-07 Stroke join discs from precomputed unit-circle tables
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:13'
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
- [x] #1 no trigonometric call per join
- [x] #2 contours bit-identical to the current ones (unit test over random polylines)
- [ ] #3 navigation AOT paint p50 -8% or better
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Join discs read three unit-circle tables (6, 10, 16 segments) built on first use with the same expression and libm calls at run time (seg is a run-time value, so cosf is not folded differently by the compiler). zinc capture --stroke-check N compares stroke_contours with the per-vertex cosf/sinf reference over random polylines of every join size: 5000 polylines, 0 mismatches (tests/t1/stroke_tables.sh).
Navigation AOT, ZN-405 + ZN-406 together, CPU time for 600 headless frames minus startup (the wall-clock paint p50 was too noisy at load 9): 3.51 -> 3.27 ms per frame, -6.9%. AC3 (-8%) not reached: the rest of the profile is program-side release/arrPush (~11% of samples, ZN-413) and the comparator sort (ZN-420).
Tests: stroke_tables (new), tests/run --changed 71/71, canary 4/4, framehash, canvas, svg_lottie.
usage: n/a
<!-- SECTION:NOTES:END -->
