---
id: ZN-302
title: 'Sim: Atelier serial monitor, bus monitor, logic analyzer, time controls'
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-296
  - ZN-300
ordinal: 53100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-11). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) logic analyzer shows the edges of a blinking pin at the right virtual times (golden). 2) I2C decoder labels `0x3c W 00 AF`. 3) pause, step 1 ms, speed x10 and replay of a `.zsim` work in a scripted test.
<!-- AC:END -->
