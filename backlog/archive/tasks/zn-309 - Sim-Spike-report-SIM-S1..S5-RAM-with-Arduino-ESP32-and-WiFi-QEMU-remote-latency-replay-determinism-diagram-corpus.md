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
ordinal: 191000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-18). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) each spike has its measured number and gate result in this doc. 2) a decision record in `zinc-next-decisions.md` for D-A1, D-A2, D-B1 with these scores. 3) tasks above re-sized if a gate fails.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Spike report SIM-S1..S5: the spikes are overtaken by what shipped (esp32sim, src/sim, Arduino core in mquickjs); decisions can be written where they are taken. Verifier: The spikes target a plan that changed (QEMU remote backend, Zinc.h interpreter): D158 chose esp32sim, the firmware is mquickjs with Arduino as an IDF component; no decision record waits on these numbers.
<!-- SECTION:NOTES:END -->
