---
id: ZN-838
title: Measure macOS workflow demos with reproducible evidence
status: Done
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
- [x] #1 Run representative cases sequentially only when no other builds run
- [x] #2 Collect three warmed passages with raw profiler and resource data and labelled engine renderer resolution and workload
- [x] #3 Publish measured startup frame work intervals CPU and memory without substituting package sizes or idle redraw rate for FPS
- [x] #4 Commit result report raw artifacts and performance log including failures and noise limits
<!-- AC:END -->

## Implementation Notes

- Completed 33 finite real-window timing passages and 11 separate live non-suspending physical-footprint snapshots; all accepted exit 0 and no observed build contamination. 30 callbacks warm up each 300-sample measurement; launch-cache identity is not assumed.
- tools/bench-workflows-macos plus CGWindow observer; targeted tests/run --only workflow_bench PASS. No engine change or extra full suite.
- Report docs/reports/workflow-macos-performance-2026-10-25.md; raw arrays/profiles, fixed-checkout hashes, resource samples, rejected runs and failed earlier clock/memory experiments retained in docs/reports/bench/workflow-macos-2026-10-25.json.
- Callbacks are not displayed FPS; spans are not GPU completion. LibGodot cadence varies; small fixture results do not prove production-world capacity. Ordinary final benchmark processes exit cleanly; optional Godot editor-import cleanup crash remains open. No push/release or other-platform benchmark.
