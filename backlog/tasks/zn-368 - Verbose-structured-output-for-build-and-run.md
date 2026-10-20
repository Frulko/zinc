---
id: ZN-368
title: 'Verbose, structured output for build and run'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-09 06:28'
labels:
  - cli
  - devtools
  - size-M
milestone: m-20
dependencies: []
ordinal: 50100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: the engine says nothing at run or build. Add `-v` / `--verbose` (and `-vv`) and `ZINC_LOG=module=level,...`: build phases with timings (read, parse, check, lower, optimise, emit ZBC, AOT C++, compile, link, bake fonts and images, plugin builds and cache hits, toolchain downloads), the target, profile and layout engine chosen, the plugins loaded; at run time the engine (interpreter, AOT, QuickJS), the window and renderer, frames and layout passes, warnings (missing fonts, slow frames, leaks at exit). Machine-readable with `--log-format json`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc build -v` prints every phase with its duration and the cache decisions (test of the line set)
- [x] #2 `ZINC_LOG=ui=debug zinc run` prints layout passes and their durations; nothing is printed without the option (goldens unchanged)
- [x] #3 `--log-format json` emits one JSON object per line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
include/zn/log.h (header only, one state per process): ZINC_LOG=<level> or <module>=<level>,... (info, debug, trace; * for all), ZINC_LOG_FORMAT=json; zinc -v / --verbose (info), -vv (debug), --log-format json set them (children inherit). Phases timed: read and parse, check, lower to IR, optimise, reference counting, emit ZBC, bake fonts and images, AOT C++, compile and link (the command at debug); the target, profile and layout line; plugin decisions (built, cache hit, fetched, prebuilt) with durations; run: the engine (interpreter, QuickJS) and the program's duration. UI: ZINC_LOG=ui=debug turns on zinc:ui's phase marks without the profiler (src/host/ui_log.cpp, apart from gfx_host.cpp which includes zrt.h) and logs each layout pass with its duration (a skipped pass told apart by its few microseconds: noted in the code), plus the rn engine's Yoga passes in layout_host.cpp. zinc help lists the options. tests/t1/verbose_log.sh: every phase line with ms, target line, plugin built then cache hit (ZINC_NATIVE=real: the runner's deterministic mode uses the stand-in), silent without -v, layout passes with ZINC_LOG=ui=debug and the program's output unchanged, JSON one object per line. T0 82/83 before commit (build_inputs_tracked: the new files untracked), tests/run --changed pass. usage: n/a
<!-- SECTION:NOTES:END -->
