---
id: ZN-420
title: >-
  PERF-21 Sort with a comparator: direct native call, borrowed args, key
  comparators
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-413
priority: low
ordinal: 5200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rtcalls.cpp:276 mergeSort calls machine.cpp:334 callComparator per comparison: 3 retains, Machine::exec, releases in the callee. Navigation AOT: mergeSort + callComparator + exec ~12% of samples. Call the comparator's native function directly with borrowed arguments in AOT; extend specializeSort to (a, b) => a.k - b.k on objects (keys extracted once, stable index sort).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 navigation AOT sort share <= 4% of samples
- [ ] #2 sort goldens (stability, NaN, -0) unchanged
<!-- AC:END -->
