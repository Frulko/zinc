---
id: ZN-427
title: PERF-28 Parallel AOT compile in several translation units
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 09:49'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
main.cpp:1349 compiles one C++ file per program at -O2: zinc build of navigation takes 81 s (68 s user). Split generated functions into N TUs compiled with the machine's job limit (3 on 16 GB machines), cache objects by function hash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 navigation zinc build <= 30 s at -j3
- [x] #2 incremental rebuild after a one-function change <= 5 s
- [x] #3 generated program identical in behaviour (AOT corpus)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ZN-604 had already split large programs into up to 3 units (navigation 81 s -> 15 s on this machine). Now (src/aot/aot.cpp emitCppParts, src/main.cpp aotcache): a program of 512 KB of C++ or more is split into a first unit (tables, baked resources, main, kNatives) and units of ZN_AOT_UNIT_FNS (48) functions in index order, so a change to one function's body changes one unit (two when it is inlined into a caller of another unit); the objects are cached in ZINC_HOME/cache/aot-obj by the hash of the unit's C++, the compiler and the flags (1500 kept, least recently used dropped); missing units compile at most ZINC_JOBS at once (half the cores, 1 to 8) through posix_spawn; with clang the units' headers (rt.h, host.h, ops.h: 1.37 s of parsing per unit) are precompiled once per compiler, flags and engine headers (-include-pch). Measured on the Intel Mac, navigation with an empty cache: zinc build 12.2 s (compile 10.4 s; AC#1 <= 30 s); unchanged 1.3 s; after changing one function (panelWidth in src/camera.ts) 4.3 s with 2.9 s of compile (AC#2 <= 5 s). AOT navigation paint p50 1.92-1.96 ms (2 units) against 1.96-2.01 (12 units): the extra calls across units cost nothing measurable. AC#3: aot (the run goldens compiled, including the split cases, now with ZN_AOT_UNIT_FNS=4 so small programs still spread over several units) and run_cache PASS. Usage: n/a.
<!-- SECTION:NOTES:END -->
