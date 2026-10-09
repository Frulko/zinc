---
id: ZN-548
title: Pi 1 / Zero hardware validation of the three paths
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-545
  - ZN-546
ordinal: 340140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On a Pi Zero W or Pi 1 B+ (owner provides) running Raspberry Pi OS 32-bit Trixie with KMS: run hero, the three r162 cube (real three.js), the diorama with the compatibility layer, and the cooked diorama at 720p output. Record fps, CPU, CMA use and throttling, and update the report. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 numbers for all three paths recorded in the report
- [ ] #2 the cooked diorama holds >= 30 fps at 640x360 upscaled to 720p
- [ ] #3 CMA and memory headroom recorded for 512 MB
<!-- AC:END -->
