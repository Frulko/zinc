---
id: ZN-553
title: 'Select the DRM card, connector and mode from zinc.json'
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
ordinal: 53100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Pick card by driver and connector name (HDMI-A-n, DSI-n, DPI-n), list them with ZINC_KMS_INFO=1, vkms test with two devices, rotation and backlight via sysfs.

display-gl and display-fbdev pick the DRM card by driver and connected connector (HDMI-A-n, DSI-n, DPI-n, SPI panel), never by number. Select the v3d render node on Pi 4/5. Rotation and backlight through sysfs. Document SPI panels through the kernel panel-mipi-dbi driver. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 with two vkms devices the right card is chosen
- [ ] #2 DSI and HDMI each selectable from zinc.json on the Pi 3B+
- [ ] #3 Pi 5 DSI on RP1 validated in RPI-SDK-14
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. display-gl picks the first card with a connected connector (kms.cpp:35-43); display-fbdev finds the console's CRTC. Left: choice by driver and connector from zinc.json, the v3d render node, rotation/backlight, vkms test. Carries ZN-522 (sun4i connector names). Evidence: plugins/display-gl/src/kms.cpp:35
<!-- SECTION:NOTES:END -->
