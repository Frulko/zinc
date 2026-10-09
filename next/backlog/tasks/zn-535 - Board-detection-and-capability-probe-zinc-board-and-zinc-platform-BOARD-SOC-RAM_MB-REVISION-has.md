---
id: ZN-535
title: >-
  Board detection and capability probe: zinc:board and zinc:platform BOARD, SOC,
  RAM_MB, REVISION, has()
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-080
ordinal: 340010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decode old- and new-style revision codes and read /proc/device-tree (model, compatible, system/linux,revision, hat/*). Probe gpiochips by label, pwmchips, i2c and spidev nodes, V4L2 devices by driver, DRM cards by driver, ALSA cards, hci0, wlan0. Expose them as zinc:platform constants and has(cap); zinc doctor --target pi prints profile and probed values; a simulator twin returns a configurable board. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 unit table covers every published revision code, old and new style, including Pi 5, 500 and CM5
- [ ] #2 QEMU raspi0, raspi1ap, raspi2b, raspi3b and raspi4b report the right model
- [ ] #3 zinc doctor on the Pi 3B+ lists gpio, i2c, spi, pwm, hwdec h264, wifi and ble correctly
- [ ] #4 missing nodes give has() = false, never an error
<!-- AC:END -->
