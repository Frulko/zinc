---
id: ZN-294
title: >-
  Sim: `board.json` parser and writer (diagram.json superset), part registry
  with `wokwi-*` aliases
status: Done
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 08:45'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-292
ordinal: 53020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-03). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1) 10 authored diagrams (from the public format description) load; unknown part types give a diagnostic naming the type. 2) load then save then load gives an identical document (round trip). 3) the `zinc` extension block is ignored by a strict diagram.json reader (schema test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/sim/board.{h,cpp}: parseBoard / saveBoard / validateBoard over yyjson (parts, connections, zinc extension, unknown members kept), src/sim/parts/registry (zn- types with wokwi- aliases, outside the core so the core names no part); 10 diagrams in tests/golden/sim/diagrams, an unknown-type and a dangling-connection case, round trip load-save-load identical, a strict diagram.json reader sees the same board with and without the zinc block (tests/t0/sim_board.sh, tests/native/board_test.cpp). The diagrams are authored from the public format description, not copied from Wokwi projects.
<!-- SECTION:NOTES:END -->
