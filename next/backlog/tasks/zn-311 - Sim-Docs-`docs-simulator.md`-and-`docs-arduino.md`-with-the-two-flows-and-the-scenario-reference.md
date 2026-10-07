---
id: ZN-311
title: >-
  Sim: Docs: `docs/simulator.md` and `docs/arduino.md` with the two flows and
  the scenario reference
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-S
milestone: m-18
dependencies:
  - ZN-295
  - ZN-307
ordinal: 53190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-20). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) the examples in the docs are run by a T0 test. 2) `zinc help sim` lists the steps. 3) English, no emojis.
<!-- AC:END -->
