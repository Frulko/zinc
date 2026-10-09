---
id: ZN-405
title: PERF-06 Host polygon/path/stroke rows read program arrays in place
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:02'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/src/host/gfx_host.cpp:35 arr() copies a Zinc array into a TLSF-allocated zrt::Array<double> element by element, then add_points copies into the frame pool. Navigation AOT: push_raw, arr, add_points, tlsf malloc/free and memmove are ~10% of main-thread samples. Add (const double*, n) overloads in zrt::gfx and pass the f64[] storage directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 no zrt::Array allocation per polygon/path/stroke call
- [ ] #2 navigation AOT paint p50 -8% or better (baseline 3.5 ms headless)
- [x] #3 pixel goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
polygon/path/stroke take (const double*, n): the host rows pass the program's f64 storage in place, the zrt::Array overloads forward to them, line() builds its quad on the stack instead of an Array. No zrt::Array allocation per call (arr() removed from gfx_host.cpp); push_raw/arr/tlsf are gone from the navigation profile.
Measured navigation AOT paint p50 (headless, 300 frames, alternated, machine loaded): 3.61-3.66 -> 3.49-3.58 ms, about -3%: the rest of the audit's 10% was program-side array building (ArrPush/release, ZN-413) and stroke trigonometry (stroke_contours + sincosf ~14% of samples), which is ZN-406; AC2 (-8%) is carried there.
Tests: tests/run --changed 48/48, proto-capture canary 4/4, framehash, canvas.
usage: n/a
<!-- SECTION:NOTES:END -->
