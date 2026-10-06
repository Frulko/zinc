---
id: ZN-126
title: Bus shim (hw.h) with Linux and ESP32 backends
status: Backlog
assignee: []
created_date: '2026-10-06 22:59'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-104
ordinal: 40680
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
C API (section 5.2 of docs/reports/parity/03) so ssd1306, ws2812, scrollphat and the IMU driver talk to a bus abstraction; backends: Linux i2c-dev/spidev/gpio chardev, ESP-IDF, and the simulator.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 drivers build for ESP32 (IDF) and Linux and produce the same frames as before
<!-- AC:END -->
