---
id: ZN-415
title: 'PERF-16 zinc run / zinc dev startup: faster passes and a ZBC cache'
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: medium
ordinal: 5150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run examples/hero spends 1.7 s before the first instruction: parse 85, check 227, lower 436, optimise 100, RC 353, emit 269 ms (program 36 ms). rc.cpp liveness uses dense blocks x values byte vectors. Sparse liveness, profile lower/emit for quadratic spots, cache the ZBC by hash of sources + profile + engine version.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero zinc run to first frame <= 100 ms with a warm cache, <= 0.8 s cold (baseline 1.7 s)
- [ ] #2 cache invalidated by any source, profile or engine change (test)
- [ ] #3 zinc -v phase times recorded in the task
<!-- AC:END -->
