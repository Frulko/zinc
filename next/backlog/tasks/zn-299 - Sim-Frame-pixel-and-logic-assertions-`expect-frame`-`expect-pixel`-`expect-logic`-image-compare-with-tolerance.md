---
id: ZN-299
title: >-
  Sim: Frame, pixel and logic assertions: `expect-frame`, `expect-pixel`,
  `expect-logic`, image compare with tolerance
status: Review
assignee: []
created_date: '2026-10-07 13:14'
updated_date: '2026-10-08 12:09'
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
- [x] #1 1) `compare-with` PNG passes with a 0.5% tolerance and fails on a 1-pixel layout shift of a text. 2) `--update-goldens` rewrites hashes and images. 3) hashes equal between macOS emulator and device-sim (ZN-125 contract).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. compare-with PNG with a tolerance (fraction of differing pixels): a 2x2 pixel change passes at 0.5%, a text shifted by one pixel fails; zinc sim --update-goldens writes the compare-with images and rewrites the hash of every expect-frame in the scenario file; expect-logic is parsed (pins, window, edges) and says plainly that a program has no pins to watch yet; tests/t1/sim_compare.sh. AC3 (hashes equal between the macOS emulator and device-sim) waits for ZN-313, the device core with a frame surface.
<!-- SECTION:NOTES:END -->
