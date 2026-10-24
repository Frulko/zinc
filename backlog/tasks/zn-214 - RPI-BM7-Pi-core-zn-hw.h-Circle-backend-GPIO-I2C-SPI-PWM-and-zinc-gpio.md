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
ordinal: 91500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third implementation of zn/hw.h next to esp32 and linux/sim. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 QEMU: I2C against a -device slave; SPI controller loopback unit test; GPIO through the sim backend; hardware checklist for an LED and an SSD1306 on the rig
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Bare-metal Raspberry Pi core. The Pi OS image builder, device agent and fast-boot image shipped, and cover the Pi for makers; the bare-metal core only buys boot time and needs Circle (GPLv3 question), a rig and no Mac proof. Park the chain; first step is ZN-207. Evidence: docs/reports/zinc-next-baremetal-pi.md; no firmware/rpi; image/ (Pi OS image) shipped
<!-- SECTION:NOTES:END -->
