---
id: ZN-046
title: 'Profiling suite: CPU, RAM, frame time, energy'
status: Done
assignee: []
created_date: '2026-10-06 15:37'
updated_date: '2026-10-06 16:15'
labels: []
dependencies: []
priority: high
ordinal: 28300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A set of tools to measure the engine and the apps it runs: per-function time and instruction counts in the interpreter (sampling and exact), allocation and reference-counting statistics (live objects, peak and per-class RAM, retain/release traffic, leaks), frame-time phases of a UI app (ZINC_PROFILE-like: app, layout, paint, raster, present, p50/p99), process CPU and RSS over time, and energy where the host offers it (powermetrics on macOS, a power meter on the Pi rig). Output in proven formats (Chrome/Perfetto trace JSON, speedscope or pprof for flame graphs) plus a JSON summary the benchmark runner can diff between commits. Prefer existing libraries and tools (Perfetto, speedscope, pprof) over our own viewers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc profile <prog> writes a flame graph (speedscope or pprof) and a per-function table for the interpreter
- [x] #2 zinc mem <prog> reports peak and per-class memory, live objects at exit and retain/release counts; the leak check of the tests uses it
- [x] #3 UI apps report frame-time phases with p50/p99 and a Perfetto trace; the zinc:ui examples run under it headless
- [x] #4 a resource sampler records CPU and RSS over a run and, where available, energy; tools/bench-m4 stores the numbers and flags regressions between commits
- [x] #5 documented in docs/, with one T0 test per tool
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a (tools/usage had no data). Done: zinc profile (sampling, speedscope and folded stacks, table), zinc mem (per class counts, retain/release, peak RSS, --check-leaks used by rc.sh), UI frame phases and Perfetto trace through the runtime profiler (zinc:gfx profiling/profMark/finish; one 2-line addition to runtime/zrt.cpp: finish_run), tools/resmon + zn_resmon.py (CPU, RSS, energy via RAPL or powermetrics), bench-m4 records user/system time and peak RSS and flags regressions against HEAD. docs/reports/zinc-next-profiling.md, T0 prof.sh. Not covered: exact instruction counts, energy on the Pi rig.
<!-- SECTION:NOTES:END -->
