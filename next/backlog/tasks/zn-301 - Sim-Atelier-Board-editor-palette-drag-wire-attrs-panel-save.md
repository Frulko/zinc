---
id: ZN-301
title: 'Sim: Atelier Board editor: palette, drag, wire, attrs panel, save'
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-300
ordinal: 53090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-10). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) scripted session adds an LED and resistor, wires them, saves; the file loads in SIM-03 and passes a netlist check. 2) undo/redo of 10 operations. 3) a pin conflict (two outputs on one net) shows a warning.
<!-- AC:END -->
