---
id: ZN-837
title: Add Godot Warehouse macOS performance probe
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 15:25'
labels:
  - size-M
  - perf
  - macos
dependencies: []
ordinal: 546460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-25: measure workflow performance on macOS first. Add an opt-in finite actual-window Warehouse probe with explicit warmup, frame/step/upload boundaries and idle versus updating UI workloads. Timed runs are coordinator-only on a quiet machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Finite actual-window probe outputs versioned JSON for idle and updating UI workloads
- [ ] #2 Frame interval and CPU boundaries are explicit and do not imply GPU completion time
- [ ] #3 Smoke check validates output schema and clean shutdown without publishing loaded-machine timings
<!-- AC:END -->
