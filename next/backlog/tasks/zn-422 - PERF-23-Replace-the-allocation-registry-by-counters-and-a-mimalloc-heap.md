---
id: ZN-422
title: PERF-23 Replace the allocation registry by counters and a mimalloc heap
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rt.h:207 track pushes every object on Machine::allocated; machine.cpp:161-163 swap-removes on free, writing into another object's header (likely cache miss). Keep live counters for the leak count, allocate objects from a dedicated mi_heap_t and mi_heap_destroy at exit, mi_heap_visit_blocks for leak listings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no per-object registry
- [ ] #2 binarytrees and strings AOT and interpreter -5% or better, measured
- [ ] #3 leak reports, traceFree order and destruction-order goldens unchanged
<!-- AC:END -->
