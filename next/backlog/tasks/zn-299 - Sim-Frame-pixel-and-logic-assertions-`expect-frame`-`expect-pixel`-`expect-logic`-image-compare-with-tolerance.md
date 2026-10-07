---
id: ZN-299
title: >-
  Sim: Frame, pixel and logic assertions: `expect-frame`, `expect-pixel`,
  `expect-logic`, image compare with tolerance
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-295
  - ZN-125
ordinal: 53070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-08). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) `compare-with` PNG passes with a 0.5% tolerance and fails on a 1-pixel layout shift of a text. 2) `--update-goldens` rewrites hashes and images. 3) hashes equal between macOS emulator and device-sim (ZN-125 contract).
<!-- AC:END -->
