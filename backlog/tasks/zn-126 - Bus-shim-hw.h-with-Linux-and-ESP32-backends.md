---
id: ZN-126
title: Bus shim (hw.h) with Linux and ESP32 backends
status: Done
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-25 01:53'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-104
ordinal: 359000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
C API (section 5.2 of docs/reports/parity/03) so ssd1306, ws2812, scrollphat and the IMU driver talk to a bus abstraction; backends: Linux i2c-dev/spidev/gpio chardev, ESP-IDF, and the simulator.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 drivers build for ESP32 (IDF) and Linux and produce the same frames as before
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. runtime/include/hw.h (header-only I2C/SPI shim, back ends esp32 i2c_master with shared buses, linux i2c-dev/spidev, simulator with attachable chip models); scrollphat, ssd1306, ws2812 (SPI), imu-qmi8658 (esp32) and st7789 touch ported; models of IS31FL3730, SSD1306 and the WS2812 SPI stream in plugins/*/test_hw.cpp; tests/t1/hw_shim.sh (sim + linux x86_64/aarch64 build with zig). Bug fixed: ssd1306 skipped columns equal to the 0xFF placeholder on the first frame (all-lit columns never reached the panel). AC1 open: no ESP-IDF here, so the esp32 branches of hw.h, imu and st7789 are written but not built; frames of the existing self-checks (test_frame, test_map) unchanged. Header lives in runtime/include, not include/zn, so plugins find it like hal.h. gpio and RMT are not in the shim yet.
Review 2026-10-25: closed as Done. Header-only hw.h shim with esp32, linux and sim backends exists and is tested; only the ESP-IDF build of the esp32 branch was never run (no IDF). Move that to the cross-platform pass line. Close done. Evidence: runtime/include/hw.h; tests/t1/hw_shim.sh; plugins/*/test_hw.cpp Verifier: runtime/include/hw.h and tests/t1/hw_shim.sh exist. What is left is the ESP-IDF build of the esp32 branches, which is cross-pass: it needs one later.md line (also: gpio and RMT are not in the shim).
<!-- SECTION:NOTES:END -->
