---
id: ZN-295
title: 'Sim: Scenario runner `zinc sim` with YAML steps, `SimRunner` for `zinc test`'
status: Backlog
assignee: []
created_date: '2026-10-07 13:13'
labels:
  - simulator
  - arduino
  - size-L
milestone: m-18
dependencies:
  - ZN-294
  - ZN-293
  - ZN-124
ordinal: 53030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-04). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) steps wait-serial, write-serial, delay, advance, set-control, expect-pin, expect-bus, expect-frame, take-screenshot work on `examples/boards/s3-matrix`. 2) a failing step exits non-zero and prints virtual time and writes the last frame PNG. 3) the Wokwi docs example (`wait-serial`/`set-control`/`expect-pin`) runs unchanged on an equivalent board.
<!-- AC:END -->
