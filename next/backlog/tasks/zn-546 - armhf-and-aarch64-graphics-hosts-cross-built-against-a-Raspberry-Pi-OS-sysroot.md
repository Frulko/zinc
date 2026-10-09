---
id: ZN-546
title: armhf and aarch64 graphics hosts cross-built against a Raspberry Pi OS sysroot
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-164
ordinal: 340120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc build --target armhf-linux and aarch64-linux link the graphics host (zrt, raster, display-gl, display-fbdev, libzn_webgl) with zig against a pinned, checksummed Raspberry Pi OS Trixie sysroot of headers and stub libraries (libdrm, gbm, EGL, GLESv2). Includes a size gate for the Pi 1. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hero and the three.js cube build for armhf-linux on macOS without Docker
- [ ] #2 the binaries run on the Pi 3B+ (64-bit and 32-bit userland) with only OS libraries
- [ ] #3 armhf size budget recorded and gated (ZN-164)
<!-- AC:END -->
