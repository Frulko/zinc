---
id: ZN-303
title: >-
  Sim: Custom chips: C ABI over WASM (plugin `wasm`) with a Wokwi-shaped API
  (pins, I2C, SPI, UART, timers, framebuffer, attrs)
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
  - ZN-292
  - ZN-126
ordinal: 92500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-12). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) a 40-line C chip (I2C register file) compiled to WASM with zig responds to a program. 2) a chip that crashes or loops is stopped with a diagnostic. 3) the same chip works host-native and through SIM-07.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. WASM custom chips with a Wokwi-shaped API: niche, large; the 14 built-in chip models (src/sim/chips) cover the shipped boards. Revisit on demand.
<!-- SECTION:NOTES:END -->
