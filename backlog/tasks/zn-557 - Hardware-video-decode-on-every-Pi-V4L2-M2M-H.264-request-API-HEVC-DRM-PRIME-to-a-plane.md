---
id: ZN-557
title: 'Hardware video decode: HEVC and display-gl layers'
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
ordinal: 53400
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** HEVC through the V4L2 request API on Pi 4/5; display-gl takes HalDisplay.layers (EGLImage or plane); measure 1080p30 CPU on the Pi 3B+. The H.264 + fbdev plane part is done. Already there: docs/plugins/video.md:46; docs/plugins/display-fbdev.md:47,124.

zinc:video uses FFmpeg h264_v4l2m2m on Pi 0-4, HEVC through the V4L2 request API on Pi 4/5 (Raspberry Pi FFmpeg build), and software H.264 on Pi 5. Frames stay DMA-BUF and go to a KMS plane (RPI-3D-03) or an EGLImage external texture. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bbb.mp4 at 1080p30 plays on the Pi 3B+ under 30 % of one core
- [ ] #2 visl and vicodec CI tests exercise the M2M code paths
- [ ] #3 Pi 5 HEVC path validated in RPI-SDK-14
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. H.264 V4L2 M2M decode with dmabuf frames shown on a KMS plane exists on the 32-bit path (plugins/video/native/video.rpi1.cpp, plugins/display-fbdev hardware layers, docs/plugins/video.md:42-50). Left: HEVC request API (Pi 4/5), display-gl EGLImage/plane path (later line ZN-731), 1080p30 CPU figure, visl/vicodec tests. Evidence: docs/plugins/video.md:46; docs/plugins/display-fbdev.md:47,124
<!-- SECTION:NOTES:END -->
