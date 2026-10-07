---
id: ZN-300
title: >-
  Sim: Atelier Board view (read-only): parts as SVG, wires, live LEDs, displays,
  clickable buttons and pots
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-294
  - ZN-143
ordinal: 53080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-09). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) T1 pixel golden of the board of `esp32-2432s022` with LED on and off. 2) clicking the button part changes the program's output. 3) the view survives 1000 frames with no growth in memory (resmon).
<!-- AC:END -->
