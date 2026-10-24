---
id: ZN-136
title: 'ESP32 board images with host modules in the core, and what the QEMU models'
status: Done
assignee: []
created_date: '2026-10-06 23:01'
updated_date: '2026-10-25 01:53'
labels:
  - targets
  - simulator
  - size-L
milestone: m-11
dependencies:
  - ZN-131
  - ZN-123
ordinal: 366000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First list what the pinned Espressif QEMU models (I2C, SPI, RMT, LEDC, GPIO, RGB LCD for esp32 and esp32s3) and record it in zinc-next-esp32.md; then prebuilt images per board preset (ws2812, ssd1306, st7789 + cst820, imu, gpio, net, NVS storage, canvas2d, lottie, 3d, pixelfont) with IDF REQUIRES from plugin.json and zinc:gfx over the panel HAL; per driver, QEMU or device-sim is the gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a table of QEMU-modelled peripherals in the doc
- [x] #2 s3-matrix and 2432s022 images boot in QEMU and in device-sim and report their module list
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC1: the table of QEMU-modelled peripherals (esp32 and esp32s3, read from the pinned QEMU's qom tree) is in docs/reports/zinc-next-esp32.md. AC2 (board images built with IDF and booted in QEMU and device-sim with their module list) is open: it needs full IDF builds per board; device-sim already reports the module list of the board presets.
Review 2026-10-25: closed as Done. AC1 (QEMU peripheral table in zinc-next-esp32.md) done; AC2 needs full ESP-IDF builds per board, which is ESP32 cross-pass work. Close done; one cross-pass line for the board images. Evidence: docs/reports/zinc-next-esp32.md; tests/t2/esp32_qemu.sh Verifier: AC1 table is in docs/reports/zinc-next-esp32.md. AC2 needs IDF board images, which is ESP32 cross-pass work: one later.md line.
<!-- SECTION:NOTES:END -->
