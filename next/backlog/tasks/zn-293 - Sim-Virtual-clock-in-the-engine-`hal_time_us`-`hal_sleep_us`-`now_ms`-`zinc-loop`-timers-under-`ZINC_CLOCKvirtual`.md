---
id: ZN-293
title: >-
  Sim: Virtual clock in the engine: `hal_time_us`, `hal_sleep_us`, `now_ms`,
  `zinc:loop` timers under `ZINC_CLOCK=virtual`
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
labels:
  - simulator
  - arduino
  - size-S
milestone: m-18
dependencies:
  - ZN-292
ordinal: 53010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-02). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) a program sleeping 10 s in a loop prints the same output in under 200 ms wall. 2) the same program under `--clock real` is unchanged. 3) interpreter, AOT and QuickJS give the same virtual timestamps (T1).
<!-- AC:END -->
