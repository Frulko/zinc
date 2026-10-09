---
id: ZN-517
title: 'zinc:gpio on Linux: GPIO v2 chardev, named lines, CHIP board table'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-514
ordinal: 320050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/mod/gpio_linux.cpp only opens /dev/gpiochip0 through libgpiod and masks pins to 0..63, so the XIO expander (pcf8574a chip) and native pins such as CSID0 (line 132) are unreachable. Address lines by chip label + offset or by name from a board table (XIO-P0..7, CSID0..7, AP-EINT1/3, PWM0...), use the GPIO v2 uapi ioctls directly (static binaries cannot use libgpiod), kernel edge detection and debounce, sysfs fallback for 4.4 kernels (XIO base found from the pcf8574a label, native = bank*32+pin). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a T1/T2 test drives gpio-sim lines named XIO-P0 and CSID0 in the CHIP-03 guest: output, input, both edges, debounce
- [ ] #2 the pcf857x path is exercised against QEMU's pcf8574 model
- [ ] #3 the existing simulator and ZINC_GPIO_SCRIPT keep working on macOS
- [ ] #4 on hardware: XIO-P0 drives an LED and an edge on CSID0 reaches the callback
<!-- AC:END -->
