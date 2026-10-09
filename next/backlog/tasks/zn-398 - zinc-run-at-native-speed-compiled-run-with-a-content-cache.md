---
id: ZN-398
title: 'zinc run at native speed: compiled run with a content cache'
status: Done
assignee: []
created_date: '2026-10-09 07:22'
updated_date: '2026-10-09 07:32'
labels:
  - perf
  - cli
dependencies:
  - ZN-397
priority: high
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-09: the prototype's 'zinc run' compiled the program to native code, so 'run' was fast; Next's 'zinc run' interprets (bouncing-ball 200k balls, window: run 23.9 fps vs prototype run 31.9 and Next AOT 32.2). Make 'zinc run' build and launch the AOT program when a C++ compiler is present, with a cache keyed by the sources, the engine and the flags (second run starts at once), and keep the interpreter for 'zinc dev' hot reload and for '--interp'. Record the decision (D43) with its scores.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run of a program that draws runs the AOT build, cached by content hash; a second run with unchanged sources does not recompile (measured)
- [x] #2 zinc run --interp keeps the interpreter; zinc dev keeps hot reload
- [x] #3 bouncing-ball 200k balls with zinc run reaches the AOT fps (window, measured)
- [x] #4 D43 in docs/reports/zinc-next-decisions.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc run of a program that draws now compiles it (zinc build into ~/.zinc/cache/run/<entry hash>/app, key = the program's C++ with its baked resources + zinc.json + engine binary and libraries + plugins + CXX/ZINC_TEXT) and execs it with the program arguments; --interp / ZINC_RUN=interp interprets, zinc dev sets it for its restarts, headless and deterministic runs interpret unless --native; no compiler, a dev bundle, a --profile or a failed build fall back to the interpreter. AOT programs now receive argv (zinc:sys args()). D43 recorded with scores.
Measured, bouncing-ball 200k balls, window, 10 s alternated: zinc run 23.9 -> 31.7 fps (prototype run 33.7, under load from research agents); cached start 0.27 s vs 0.23 s interpreted; first run of a version about 4-7 s.
Tests: run_compiled (new: first run compiles, second reuses, same output/frames/args as --interp, test runs interpret, changed source rebuilds), tests/run --changed 66/66.
usage: n/a
<!-- SECTION:NOTES:END -->
