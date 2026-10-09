---
id: ZN-405
title: PERF-06 Host polygon/path/stroke rows read program arrays in place
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
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
- [ ] #1 no zrt::Array allocation per polygon/path/stroke call
- [ ] #2 navigation AOT paint p50 -8% or better (baseline 3.5 ms headless)
- [ ] #3 pixel goldens unchanged
<!-- AC:END -->
