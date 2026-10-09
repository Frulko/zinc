---
id: ZN-592
title: 'Launch cost of the zinc binary: 11 ms before any command'
status: Backlog
assignee: []
created_date: '2026-10-09 09:24'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-408
priority: high
ordinal: 370270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-408: 'zinc --version' takes 11.2-11.7 ms and retires 88M instructions (qjs -e 1: 5.1 ms, 20M), so 'zinc run kernel.zbc' starts in ~12-15 ms and small benchmarks (jsonout: 2 ms of work) lose to QuickJS on startup alone. An empty C program linked with zinc's 12 frameworks starts in 3.4 ms (plain: 2.1 ms): ~8 ms are zinc's own static initializers (28 in __init_offsets) and the work in main before dispatch (fusedArchive opens the executable, module registration, sourceRoot, installGfx/installLayout, plugin and policy lookups). Profile it (xctrace Time Profiler over a launch loop, or timestamps), make the initialization lazy, and keep frameworks off the path of commands that do not draw (weak linking or dlopen of the window host, as libzn_webgl does).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc --version and zinc run of a console.log(1) program start in <= 4 ms on macOS arm64 (median of 20)
- [ ] #2 jsonout interpreter >= QuickJS speed in tools/bench-m4 (carried from ZN-408)
- [ ] #3 a T1 test keeps the launch under a budget (with a margin for CI noise)
<!-- AC:END -->
