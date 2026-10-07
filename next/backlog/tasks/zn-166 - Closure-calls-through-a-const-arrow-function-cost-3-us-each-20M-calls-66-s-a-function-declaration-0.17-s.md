---
id: ZN-166
title: >-
  Closure calls through a const arrow function cost 3 us each (20M calls: 66 s,
  a function declaration: 0.17 s)
status: Backlog
assignee: []
created_date: '2026-10-07 07:35'
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
