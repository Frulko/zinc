---
id: ZN-307
title: >-
  Sim: Packaging: Arduino `library.properties`, PlatformIO `library.json`, IDF
  `idf_component.yml`, generator script and CI compile matrix
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-M
  - parked
milestone: m-18
dependencies:
  - ZN-304
  - ZN-305
ordinal: 90200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-16). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) `arduino-cli lib install --git-url` of the generated tree compiles the examples for 3 boards. 2) `pio run` for `esp32dev` and `pico` passes. 3) publish commands recorded in the task notes (no publish).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Packaging of the Arduino/PlatformIO/IDF library: only after ZN-304/305 and a release decision; publishing is the owner's step.
<!-- SECTION:NOTES:END -->
