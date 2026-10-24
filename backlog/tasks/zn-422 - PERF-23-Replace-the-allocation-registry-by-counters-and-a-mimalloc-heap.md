---
id: ZN-422
title: PERF-23 Replace the allocation registry by counters and a mimalloc heap
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-25 01:53'
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
- [x] #3 leak reports, traceFree order and destruction-order goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Upper bound first (registry removed entirely, kernels median of 7, idle Intel Mac): AOT binarytrees 21.2 -> 19.6 ms, strings 65.8 -> 62.2, mapset 32.8 -> 32.5; interpreter unchanged (59.3 -> 59.0, 88.3 -> 90.8, 82.7 -> 84.5: dispatch-bound). The registry is needed where a machine outlives its program (src/dev/core.cpp: the ESP32 core and device-sim run program after program and free the leftovers) and by zinc mem's leak listing, so instead of a mimalloc heap (which would need every array and table buffer in it): Machine counts its live objects and the immortal ones (string constants, class names) always, the leak count is live - immortals in every mode (so the existing leak tests check the counters), and an AOT program (rt::runProgram's bind) turns the registry off: one machine, its process ends with it, no push per allocation and no write into another object's header per free. Result (median of 9, two rounds): AOT binarytrees 21.1/20.4 -> 19.8/20.1 ms, strings 65.4/64.2 -> 62.9/60.1, mapset noise. ZN_LEAK_CHECK: a program leaking 6 objects in cycles reports 'leaked 6 object(s)', exit 4, in the interpreter and in AOT alike. Tests: rc (leaks over the corpus, destruction order), rc_lend, rc_borrow, rc_refcast, run, aot, prof PASS. AC#1 holds for AOT programs only (the interpreter keeps the registry, for the reasons above); AC#2 AOT about -5% (binarytrees -2 to -6%, strings -4 to -6%), interpreter 0% (measured upper bound 0%). Usage: n/a.
Review 2026-10-25: the open criteria are moot. Registry kept for ESP32 core and zinc mem on purpose; measured upper bound 0% for the interpreter.
<!-- SECTION:NOTES:END -->
