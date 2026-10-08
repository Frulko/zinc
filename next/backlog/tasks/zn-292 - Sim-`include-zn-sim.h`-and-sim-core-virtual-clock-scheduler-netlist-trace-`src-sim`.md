---
id: ZN-292
title: >-
  Sim: `include/zn/sim.h` and sim core: virtual clock, scheduler, netlist, trace
  (`src/sim`)
status: Review
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 08:30'
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
- [x] #1 1) T0: events scheduled out of order run in time order and `advance(1h)` with a 1 ms timer finishes in under 1 s wall. 2) a netlist built from code resolves a net of 3 pins and reports levels. 3) no target or plugin names in `src/sim` core (grep check).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. include/zn/sim.h (the C ABI of a part), src/sim: Scheduler (virtual ns clock, heap of events, ties in scheduling order, periodic events, cancel, duration parser), Netlist (union-find nets, drive strengths with pull resistors, X on conflicts, change watchers), Trace (versioned ZSIM binary, FNV hash). tests/native/sim_test.cpp via tests/t0/sim_core.sh: out-of-order events, 1 h of a 1 ms timer in 0.05 s, a net of 3 pins, trace round trip, and a grep that src/sim names no target or plugin.
<!-- SECTION:NOTES:END -->
