---
id: ZN-046
title: 'Profiling suite: CPU, RAM, frame time, energy'
status: Backlog
assignee: []
created_date: '2026-10-06 15:37'
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
- [ ] #1 zinc profile <prog> writes a flame graph (speedscope or pprof) and a per-function table for the interpreter
- [ ] #2 zinc mem <prog> reports peak and per-class memory, live objects at exit and retain/release counts; the leak check of the tests uses it
- [ ] #3 UI apps report frame-time phases with p50/p99 and a Perfetto trace; the zinc:ui examples run under it headless
- [ ] #4 a resource sampler records CPU and RSS over a run and, where available, energy; tools/bench-m4 stores the numbers and flags regressions between commits
- [ ] #5 documented in docs/, with one T0 test per tool
<!-- AC:END -->
