---
id: ZN-836
title: Add finite macOS native-host performance probes
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 15:25'
labels:
  - size-M
  - perf
  - macos
dependencies: []
ordinal: 545460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-25: measure workflow performance on macOS first. Add opt-in finite measurement modes to Swift Observatory and the LibGodot host: startup readiness, externally driven ticks, draw/copy costs, idle/active scenario and clean shutdown. Existing default behavior unchanged; reuse native runtime profiler and common sampler.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A finite no-focus measurement mode exposes frame/tick samples and readiness for Swift and LibGodot
- [ ] #2 Idle and animated or interactive behavior are labelled and all processes exit cleanly
- [ ] #3 Tests prove probe parsing and lifecycle without publishing timings under concurrent builds
<!-- AC:END -->
