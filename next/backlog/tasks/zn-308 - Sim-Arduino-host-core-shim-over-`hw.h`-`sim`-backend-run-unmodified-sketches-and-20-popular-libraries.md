---
id: ZN-308
title: >-
  Sim: Arduino host core shim over `hw.h` `sim` backend, run unmodified sketches
  and 20 popular libraries
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-127
  - ZN-293
ordinal: 53160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-17). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) the blink + SSD1306 (Adafruit) sketch produces the golden frame in a T1 scenario. 2) a table of libraries compiled/failed is in the doc. 3) `delay(1000)` takes under 10 ms wall.
<!-- AC:END -->
