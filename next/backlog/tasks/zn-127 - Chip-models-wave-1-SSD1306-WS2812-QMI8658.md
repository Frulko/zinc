---
id: ZN-127
title: 'Chip models wave 1: SSD1306, WS2812, QMI8658'
status: Done
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-07 14:32'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-126
ordinal: 40690
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D9 (Level 2): src/sim/chips/ models fed by the bus shim; unit tests with captured byte streams from the real drivers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a captured stream renders the golden bitmap; a deliberately wrong init byte fails the test (which today passes silently)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Models src/sim/chips/{ssd1306,ws2812,qmi8658}.h (strict: charge pump before display on, page vs horizontal addressing, SPI bit patterns and reset gap, sample registers before CTRL7); tests/native/chip_*.cpp run the real drivers (ssd1306.cpp, ws2812.cpp, imu.esp32.cpp with small stubs) through hw.h, capture the stream, compare the frame with tests/golden/sim/*.pbm|ppm and replay mutated streams (0x14->0x10, 0x20 0x00->0x02, 0xA1->0xA0, 0xC8->0xC0 each fail); tests/t1/chip_models.sh. ZN_UPDATE_GOLDEN=1 rewrites goldens.
<!-- SECTION:NOTES:END -->
