---
id: ZN-305
title: >-
  Sim: `Zinc.h` interpreter library (mode B):
  `begin/poll/call/on/addModule/reservePin/useWire`, FreeRTOS task on ESP32
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-304
ordinal: 53130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-14). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) a sketch loads `/app.zbc` from LittleFS and calls `onSample` with a typed result. 2) the Zinc task and `loop()` run 60 s together without watchdog reset (QEMU or sim). 3) a native module with a signature mismatch is refused, not a crash.
<!-- AC:END -->
