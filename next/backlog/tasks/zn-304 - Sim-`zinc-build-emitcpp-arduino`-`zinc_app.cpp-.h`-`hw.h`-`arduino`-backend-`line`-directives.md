---
id: ZN-304
title: >-
  Sim: `zinc build --emit=cpp --arduino`: `zinc_app.cpp/.h`, `hw.h` `arduino`
  backend, `#line` directives
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-126
  - ZN-164
ordinal: 53120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-13). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) `arduino-cli compile` of a blink sketch including `zinc_app.h` succeeds for `esp32:esp32:esp32` and `rp2040:rp2040:rpipico`. 2) text size of the AOT runtime reported per board and under 150 KB on thumb2. 3) a pin reserved by the sketch makes loading fail with the pin number.
<!-- AC:END -->
