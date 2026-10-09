---
id: ZN-398
title: 'zinc run at native speed: compiled run with a content cache'
status: Backlog
assignee: []
created_date: '2026-10-09 07:22'
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
- [ ] #1 zinc run of a program that draws runs the AOT build, cached by content hash; a second run with unchanged sources does not recompile (measured)
- [ ] #2 zinc run --interp keeps the interpreter; zinc dev keeps hot reload
- [ ] #3 bouncing-ball 200k balls with zinc run reaches the AOT fps (window, measured)
- [ ] #4 D43 in docs/reports/zinc-next-decisions.md
<!-- AC:END -->
