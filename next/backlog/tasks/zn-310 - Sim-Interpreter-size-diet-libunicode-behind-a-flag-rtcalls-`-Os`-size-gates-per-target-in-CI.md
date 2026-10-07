---
id: ZN-310
title: >-
  Sim: Interpreter size diet: libunicode behind a flag, rtcalls `-Os`, size
  gates per target in CI
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-S
milestone: m-18
dependencies:
  - ZN-164
ordinal: 53180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-19). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) interpreter+core text under 270 KB on xtensa with libunicode off. 2) a size check script fails on a 5% regression. 3) `tools/bench-m4` unchanged within 15%.
<!-- AC:END -->
