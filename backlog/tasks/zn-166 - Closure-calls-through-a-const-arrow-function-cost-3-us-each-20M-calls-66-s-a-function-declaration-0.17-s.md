---
id: ZN-166
title: >-
  Closure calls through a const arrow function cost 3 us each (20M calls: 66 s,
  a function declaration: 0.17 s)
status: Done
assignee: []
created_date: '2026-10-07 07:35'
updated_date: '2026-10-08 02:02'
labels:
  - perf
  - runtime
milestone: m-9
dependencies: []
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while measuring ZN-099: 'const add = (a: i32, b: i32): i32 => a + b; for (20M) s = add(s, 1)' takes 66 s on the AOT build (3.3 us per call), the same loop with 'function add' 0.17 s. Find where the time goes (allocation of the closure per call? retain/release? a global captured by the lambda?) with the profiler, fix the root cause, add a bench kernel.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Root cause was not call cost: in functions that cannot release anything ('lendsForever'), the result of a RefCast was treated as lent forever, but its lender can be an owned local released at its last use (const arrow: new lambda; refcast; release lambda). The closure was freed while still used (use-after-free), the call then scanned a freed class's supers (66 s for 20M calls). RefCast results are now tracked (retain after the cast). 20M calls: 73 s -> 0.13 s AOT. Kernel tests/bench/kernels/closure_call.ts, tests/t0/rc_refcast.sh; zbc goldens param_props, many_props regenerated.
<!-- SECTION:NOTES:END -->
