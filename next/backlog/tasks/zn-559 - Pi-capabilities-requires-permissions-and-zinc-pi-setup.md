---
id: ZN-559
title: 'Pi capabilities, requires, permissions and zinc pi setup'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-549
  - ZN-550
  - ZN-551
  - ZN-556
  - ZN-558
ordinal: 340250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
capabilities.json gains i2c, spi, serial, pwm, camera, hwdec, wifi, ble, dsi, hdmi_audio and i2s, with a 'probe' value resolved by zinc:board; requires and zinc:platform understand them. ZN-322 permissions gain gpio, i2c, spi, serial, bluetooth and wifi. zinc pi setup checks and, with consent, fixes config.txt overlays, user groups, console boot and the CPU governor. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 requires ['pwm'] fails cleanly on esp32 and on the macOS simulator with a clear message
- [ ] #2 an exported app without the gpio permission is refused GPIO access
- [ ] #3 zinc pi setup is idempotent on the rig and prints every change before applying it
<!-- AC:END -->
