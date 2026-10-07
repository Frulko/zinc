---
id: ZN-296
title: 'Sim: Trace recorder and replay (`.zsim`)'
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
  - ZN-293
ordinal: 53040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-05). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) record a scripted run, replay re-injects only inputs and the output trace hash is identical over 20 runs. 2) a modified model makes replay report the first diverging event with its time. 3) trace size under 1 MB for 60 s of the s3-matrix demo.
<!-- AC:END -->
