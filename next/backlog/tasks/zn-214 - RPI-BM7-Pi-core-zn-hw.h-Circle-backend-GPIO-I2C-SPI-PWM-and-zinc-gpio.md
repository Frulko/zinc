---
id: ZN-214
title: 'RPI-BM7 Pi core: zn/hw.h Circle backend (GPIO, I2C, SPI, PWM) and zinc:gpio'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third implementation of zn/hw.h next to esp32 and linux/sim. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 QEMU: I2C against a -device slave; SPI controller loopback unit test; GPIO through the sim backend; hardware checklist for an LED and an SSD1306 on the rig
<!-- AC:END -->
