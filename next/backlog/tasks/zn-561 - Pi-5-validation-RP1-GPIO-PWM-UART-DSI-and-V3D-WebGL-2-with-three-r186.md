---
id: ZN-561
title: 'Pi 5 validation: RP1 GPIO, PWM, UART, DSI and V3D WebGL 2 with three r186'
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
  - ZN-551
  - ZN-553
  - ZN-557
ordinal: 340270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a Pi 5 (owner provides): GPIO through pinctrl-rp1, the 4-channel PWM map, the RP1 UART, DSI on drm-rp1-dsi, HEVC decode, and real three.js r186 (WebGL2 on V3D 7.1) with the same C1-C4 benches. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SDK module tests pass on the Pi 5
- [ ] #2 three r186 C2 bench at >= 60 fps at 1080p recorded
- [ ] #3 Pi 5 differences documented in the report
<!-- AC:END -->
