---
id: ZN-309
title: >-
  Sim: Spike report SIM-S1..S5: RAM with Arduino-ESP32 and WiFi, QEMU remote
  latency, replay determinism, diagram corpus
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-292
ordinal: 53170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-18). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) each spike has its measured number and gate result in this doc. 2) a decision record in `zinc-next-decisions.md` for D-A1, D-A2, D-B1 with these scores. 3) tasks above re-sized if a gate fails.
<!-- AC:END -->
