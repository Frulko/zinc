---
id: ZN-1058
title: 'ESP32: ESP-IDF drivers and workers'
status: Backlog
assignee: []
created_date: '2026-11-07 16:41'
labels:
  - esp32
  - cross
  - size-S
  - parked
milestone: m-11
dependencies: []
ordinal: 1050000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ESP-IDF checks.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Workers: worker.cpp is in the esp32, console and wasm source lists, unbuilt; prove pthread_attr_setstacksize and thread names there.
- ZN-126: the hw.h drivers built with ESP-IDF on a board, same frames as before.
- ZN-136: ESP-IDF images per board booted in QEMU, their module list reported.
- ZN-447: run the loader stage in the browser export (the worker's blocking frame loop should run it like the gfx loop) and on the ESP32 device core (it needs the asset host rows).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hw.h drivers built with ESP-IDF on a board with the same frames
- [ ] #2 ESP-IDF image per board booted in QEMU with its module list
- [ ] #3 worker.cpp builds on esp32, console and wasm sources; loader stage runs on the device core
<!-- AC:END -->
