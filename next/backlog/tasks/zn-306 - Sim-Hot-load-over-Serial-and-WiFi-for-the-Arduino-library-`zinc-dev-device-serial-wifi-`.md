---
id: ZN-306
title: >-
  Sim: Hot load over Serial and WiFi for the Arduino library; `zinc dev --device
  serial://|wifi://`
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-305
  - ZN-141
ordinal: 53140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-15). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) edit, save: the new `.zbc` runs on QEMU in under 3 s and survives a reset. 2) corrupted CRC is refused and the old program keeps running. 3) the sketch's own `Serial.print` output still reaches the monitor.
<!-- AC:END -->
