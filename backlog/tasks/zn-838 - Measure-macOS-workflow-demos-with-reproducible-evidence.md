---
id: ZN-838
title: Measure macOS workflow demos with reproducible evidence
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 15:26'
labels:
  - size-M
  - perf
  - macos
dependencies: []
ordinal: 547460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-25: measure macOS workflow demos first. Coordinate sequential quiet-machine runs of native hosts and animation/game/world scenes; report startup, frame work and intervals, CPU, RSS and physical footprint with raw artifacts and explicit limits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Run representative cases sequentially only when no other builds run
- [ ] #2 Collect three warmed passages with raw profiler and resource data and labelled engine renderer resolution and workload
- [ ] #3 Publish measured startup frame work intervals CPU and memory without substituting package sizes or idle redraw rate for FPS
- [ ] #4 Commit result report raw artifacts and performance log including failures and noise limits
<!-- AC:END -->
