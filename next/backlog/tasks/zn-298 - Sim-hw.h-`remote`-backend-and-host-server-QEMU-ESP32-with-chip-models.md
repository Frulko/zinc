---
id: ZN-298
title: 'Sim: hw.h `remote` backend and host server (QEMU ESP32 with chip models)'
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 13:45'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-126
  - ZN-136
ordinal: 53060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-07). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) the ZN-127 chip models drive `zinc run --target esp32 --qemu --board board.json`: ssd1306 frame hash equals the host-native hash. 2) 10 000 round trips under 1 s. 3) a lost frame produces a timeout error, not a hang.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started 2026-10-08, stopped when the owner asked for UI first. Plan: split into 298.01 (hw.h remote backend = the sim backend with proxy models, 8-byte framed request/reply with seq and timeout; host server src/sim/remote.{h,cpp}; T0 test over a socketpair: ssd1306 golden through the remote, 10 000 round trips, dropped frame -> timeout) and 298.02 (firmware UART2 transport, QEMU -serial tcp, zinc run --target esp32 --qemu --board). Draft of the hw.h part: next/.logs/zn-298-hw-remote.patch (untested).
<!-- SECTION:NOTES:END -->
