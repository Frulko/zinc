---
id: ZN-603
title: 'AOT program diet: hero 21.8 MB binary, 105 s build, 33.5 MB of C++'
status: Done
assignee: []
created_date: '2026-10-09 09:48'
updated_date: '2026-10-09 10:22'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-431
priority: high
ordinal: 5002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-09: 'how can it be so heavy?'. Measured on examples/hero: 21.8 MB binary (20.3 MB __TEXT), 105 s for zinc build, 33.5 MB of generated C++. Causes: (1) 2775 functions compiled, the whole zinc:ui and kit libraries: no unreachable-function removal (ZN-431); (2) the whole 3.25 MB ZBC module embedded (11.5 MB of decimal text) although every function is compiled: the program needs only the class, string, constant and global tables, and decoding and verifying it costs at every launch (ZN-592); (3) about 8 KB of C++ per function: every instruction carries its own error path with an inline message (shared trap labels per function would cut it); (4) one translation unit at -O2 (ZN-427).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero AOT binary <= 8 MB and zinc build of hero <= 30 s (macOS arm64, -j3)
- [x] #2 the embedded module has no code words for functions that are compiled (tables only); interpreter and AOT frames identical
- [ ] #3 generated C++ of hero <= 10 MB
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: (1) the module the AOT program loads keeps its tables only (each function body is one Trap word, no constants or handlers: every function is compiled) and is run-length packed (zbc::packRuns / unpackRuns, runProgramPacked): the dense vtables of 1546 classes were 8.4 MB of 0xFF runs; hero's module 3.0 MB (10.8 MB of C++ text) -> 184 KB (0.54 MB), and nothing is decoded and verified at launch beyond the tables (jsonout AOT 3.3 -> 3.06 ms, native 2.6); (2) one error exit per function (Ltrap / Lrterr) instead of an inline error path on each of the 54,514 failing instructions; (3) -Wl,-dead_strip on macOS AOT links (-0.5 MB).
hero after ZN-431 + ZN-603: generated C++ 33.5 -> 16.6 MB, zinc build 105 -> 48 s, binary 21.8 -> 16.0 MB. -Os instead of -O2 only gives 15.96 MB: the size is the shape of the code and the data. AC1 and AC3 not reached: the rest (8 MB of baked fonts, 4.3 MB of code, 5 MB of runtime) is the follow-up task.
Tests: fib AOT golden refreshed, tests/run --changed 30/30, aot, canvas, ui, script, profile, layout_bridge, host_direct, run_compiled, reach_callbacks, export_wasm, macos_bundle, native_plugins, text_shaped, svg_lottie; interpreter = AOT frames on bouncing-ball, nuxt-ui, rn-showcase.
usage: n/a
<!-- SECTION:NOTES:END -->
