---
id: ZN-294
title: >-
  Sim: `board.json` parser and writer (diagram.json superset), part registry
  with `wokwi-*` aliases
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-292
ordinal: 53020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-03). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) 10 authored diagrams (from the public format description) load; unknown part types give a diagnostic naming the type. 2) load then save then load gives an identical document (round trip). 3) the `zinc` extension block is ignored by a strict diagram.json reader (schema test).
<!-- AC:END -->
