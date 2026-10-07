---
id: ZN-292
title: >-
  Sim: `include/zn/sim.h` and sim core: virtual clock, scheduler, netlist, trace
  (`src/sim`)
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-126
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-01). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) T0: events scheduled out of order run in time order and `advance(1h)` with a 1 ms timer finishes in under 1 s wall. 2) a netlist built from code resolves a net of 3 pins and reports levels. 3) no target or plugin names in `src/sim` core (grep check).
<!-- AC:END -->
