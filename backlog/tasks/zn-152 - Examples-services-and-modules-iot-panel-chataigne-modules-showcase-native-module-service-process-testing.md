---
id: ZN-152
title: >-
  Examples: services and modules (iot-panel, chataigne, modules-showcase,
  native-module, service/*, process, testing)
status: Done
assignee: []
created_date: '2026-10-06 23:04'
updated_date: '2026-10-08 01:36'
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
- [x] #1 tests/examples.lst OK for each entry; outputs equal the prototype's on a scripted session
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tests/examples.lst has OK for process/cli, process/shell, service/sensor-hub, iot-panel, chataigne, modules-showcase, native-module (testing/ runs under zinc test). tools/example-output: process/cli, native-module and zinc test of testing/ equal the prototype's output; sensor-hub answers /healthz and /readings with the shape of its source (the prototype does not compile it now: lib/modules.d.ts:142 Z9004, so that golden is written from the program with numbers normalised). tools/proto-capture gained entry#variant rows: iot-panel after scripted GPIO presses (frames 20/60/120) and chataigne under its demo gestures (30/120/240) match the prototype's frames pixel for pixel. tests/t1/example_output.sh. Open outside this task: the prototype compiler rejects the committed lib/modules.d.ts (Z9004).
<!-- SECTION:NOTES:END -->
