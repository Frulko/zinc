---
id: ZN-556
title: 'zinc:camera v1 (rpicam-vid pipe, V4L2 UVC) and v2 (libcamera, DMA-BUF)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-L
milestone: m-25
dependencies:
  - ZN-535
ordinal: 340220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1 spawns rpicam-vid (YUV420 to stdout) through zinc:process and exposes frames as a runtime image, plus V4L2 capture for USB webcams. v2 is a libcamera plugin built against the OS libcamera for each OS release, with frames as DMA-BUF imported into EGL or a KMS plane. Both need the camera permission. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 vivid-based V4L2 test passes in Linux CI
- [ ] #2 fake rpicam-vid script test passes on the host
- [ ] #3 camera module preview at 30 fps on the Pi 3B+ with v1
- [ ] #4 v2 zero-copy preview measured
<!-- AC:END -->
