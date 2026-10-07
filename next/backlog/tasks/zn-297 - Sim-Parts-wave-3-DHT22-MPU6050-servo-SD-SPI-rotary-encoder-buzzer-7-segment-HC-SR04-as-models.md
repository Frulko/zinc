---
id: ZN-297
title: >-
  Sim: Parts wave 3: DHT22, MPU6050, servo, SD (SPI), rotary encoder, buzzer,
  7-segment, HC-SR04 as models
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-128
ordinal: 53050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-06). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) each model has a T0 test with a captured transaction stream (real library byte streams, as ZN-127). 2) `set-control` changes the sensor value and a program sees it on the next read. 3) a wrong register address in a test driver is reported as a bus error.
<!-- AC:END -->
