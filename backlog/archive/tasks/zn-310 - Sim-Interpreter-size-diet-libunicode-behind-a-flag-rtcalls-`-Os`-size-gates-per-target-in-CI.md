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
ordinal: 190000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-19). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) interpreter+core text under 270 KB on xtensa with libunicode off. 2) a size check script fails on a 5% regression. 3) `tools/bench-m4` unchanged within 15%.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-164. Interpreter size diet and size gates per target are the same work as ZN-164 (size gates for Pi 1 and ESP32); carry the xtensa 270 KB and 5%-regression script over. Verifier: ZN-164 is open (Backlog) and holds the per-target size gates; carry over the libunicode build flag, rtcalls -Os, the 270 KB xtensa budget, the 5% regression script and the bench-m4 15% check.
<!-- SECTION:NOTES:END -->
