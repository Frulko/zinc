---
id: ZN-128
title: 'Chip models wave 2: ST7789 + CST820, IS31FL3730'
status: Done
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-07 14:36'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-127
ordinal: 40700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Band renderer correctness (damage rectangles), orientation (madctl), touch controller scripts, Scroll pHAT matrix model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 board preset esp32-2432s022 renders its golden through the model; display-st7789 runs on the host
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Models st7789.h (DCS: sleep/display on/COLMOD/MADCTL MX MY BGR/INVON, address window, pixels counted so damage is checked), cst820.h (touch register block, no-sleep write), is31fl3730.h (latched columns, config, PWM) in src/sim/chips; display-st7789 runs on the host through tests/native/stubs (esp_lcd, spi/i80, ledc, gpio stubs, no source change); preset esp32-2432s022 values drive tests/native/chip_st7789.cpp: golden tests/golden/sim/esp32-2432s022.ppm, damage = bounding box only (480 px), touch scripts and clamping, no-bus/asleep/18bpp errors; chip_scrollphat.cpp with golden and two stream mutations; tests/t1/chip_models.sh. Not modelled: MADCTL MV, ILI9341 specifics, i80 timing.
<!-- SECTION:NOTES:END -->
