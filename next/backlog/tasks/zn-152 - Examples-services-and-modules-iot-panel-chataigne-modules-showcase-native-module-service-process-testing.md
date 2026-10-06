---
id: ZN-152
title: >-
  Examples: services and modules (iot-panel, chataigne, modules-showcase,
  native-module, service/*, process, testing)
status: Backlog
assignee: []
created_date: '2026-10-06 23:04'
labels:
  - examples
  - size-M
milestone: m-15
dependencies:
  - ZN-080
  - ZN-081
  - ZN-085
  - ZN-086
  - ZN-087
  - ZN-084
  - ZN-098
  - ZN-124
ordinal: 40940
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run every non-visual and board-simulating example unchanged, with their output compared to the prototype's: sensor-hub /healthz, chataigne's simulator over OSC, iot-panel GPIO, native-module's C++ sensor, process/cli, testing/tests under `zinc test`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/examples.lst OK for each entry; outputs equal the prototype's on a scripted session
<!-- AC:END -->
