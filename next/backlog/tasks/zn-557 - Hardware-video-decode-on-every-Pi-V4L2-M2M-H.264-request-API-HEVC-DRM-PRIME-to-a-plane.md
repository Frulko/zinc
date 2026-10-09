---
id: ZN-557
title: >-
  Hardware video decode on every Pi: V4L2 M2M H.264, request-API HEVC, DRM PRIME
  to a plane
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-L
milestone: m-25
dependencies:
  - ZN-537
ordinal: 340230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:video uses FFmpeg h264_v4l2m2m on Pi 0-4, HEVC through the V4L2 request API on Pi 4/5 (Raspberry Pi FFmpeg build), and software H.264 on Pi 5. Frames stay DMA-BUF and go to a KMS plane (RPI-3D-03) or an EGLImage external texture. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bbb.mp4 at 1080p30 plays on the Pi 3B+ under 30 % of one core
- [ ] #2 visl and vicodec CI tests exercise the M2M code paths
- [ ] #3 Pi 5 HEVC path validated in RPI-SDK-14
<!-- AC:END -->
