---
id: ZN-553
title: >-
  DRM card and connector discovery by driver (vc4, v3d, RP1 DSI/DPI,
  panel-mipi-dbi)
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-535
ordinal: 340190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
display-gl and display-fbdev pick the DRM card by driver and connected connector (HDMI-A-n, DSI-n, DPI-n, SPI panel), never by number. Select the v3d render node on Pi 4/5. Rotation and backlight through sysfs. Document SPI panels through the kernel panel-mipi-dbi driver. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 with two vkms devices the right card is chosen
- [ ] #2 DSI and HDMI each selectable from zinc.json on the Pi 3B+
- [ ] #3 Pi 5 DSI on RP1 validated in RPI-SDK-14
<!-- AC:END -->
