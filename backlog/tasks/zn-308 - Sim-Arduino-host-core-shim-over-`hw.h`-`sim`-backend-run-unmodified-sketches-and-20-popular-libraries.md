---
id: ZN-308
title: >-
  Sim: Arduino host core shim over `hw.h` `sim` backend, run unmodified sketches
  and 20 popular libraries
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-L
  - parked
milestone: m-18
dependencies:
  - ZN-127
  - ZN-293
ordinal: 92600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-17). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) the blink + SSD1306 (Adafruit) sketch produces the golden frame in a T1 scenario. 2) a table of libraries compiled/failed is in the doc. 3) `delay(1000)` takes under 10 ms wall.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) No host Arduino shim exists and esp32sim is not shown running a sketch: commit 209fc865 only puts a sketch in the real ESP32 firmware (examples/esp32-arduino), never touches tools/esp32sim, and examples/esp32-arduino/README.md says 'on the computer ARDUINO is not defined'. Simulating unmodified sketches without a board is maker/education value, not superseded. Evidence: tools/esp32sim/README.md; commit 209fc865
<!-- SECTION:NOTES:END -->
