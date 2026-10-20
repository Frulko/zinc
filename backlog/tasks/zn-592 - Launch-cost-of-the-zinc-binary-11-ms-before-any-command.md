---
id: ZN-592
title: 'Launch cost of the zinc binary: 11 ms before any command'
status: Done
assignee: []
created_date: '2026-10-09 09:24'
updated_date: '2026-10-10 15:47'
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
- [x] #3 a T1 test keeps the launch under a budget (with a margin for CI noise)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (usage: n/a, session total); AC1 and AC2 split to ZN-592.01 (window host on demand) and ZN-592.02 (arm64 measure).
- Measured on the Intel Mac: time to main 29 ms (sysctl start time vs main); empty program with zinc's frameworks 9.3 ms, plain 3.5 ms; zinc's main before --version 0.4 ms. Profiled a suspended launch with sample(1): dyld applyFixups ~11 ms (1793 binds: 438 libSystem, 244 weak coalescing, 205 libc++, ~300 GUI frameworks), handleStrongWeakDefOverrides + shared cache patching for the replaced operator new ~4-8 ms; DYLD_PRINT_INITIALIZERS timed: zinc's 29 initializers each < 0.1 ms.
- Change: zn_rt no longer links zn_rt_new (the global operator new/delete on mimalloc) into zinc; the runtime's containers already count against a heap budget through ObjAlloc; libzn_rt_new.a is still built with zinc for compiled programs with a budget. Time to main 29 -> 21-24 ms; zinc --version 21.1 ms, zinc run console.log(1) 23.0 ms (best of 20). Cost: zinc check hero 0.42-0.44 -> 0.44-0.47 s.
- Tried and dropped: -fvisibility-inlines-hidden (1793 -> 1705 binds, same launch).
- AC3: tests/t1/launch_time.sh: zinc's own cost over an empty program with the same frameworks, best of 20, budget 20 ms (14.3 / 16.1 now; the binary with the replaced operator new measured 19.6 / 21.0 and fails it). profile and aot tests pass.
- AC1 (<= 4 ms on arm64) and AC2 (jsonout >= QuickJS: 33.6 vs 14.0 ms here, launch-bound) not met: ZN-592.01, ZN-592.02.
<!-- SECTION:NOTES:END -->
