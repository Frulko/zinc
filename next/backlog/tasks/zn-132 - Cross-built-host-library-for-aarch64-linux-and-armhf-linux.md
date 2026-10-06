---
id: ZN-132
title: Cross-built host library for aarch64-linux and armhf-linux
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
labels:
  - targets
  - size-M
milestone: m-11
dependencies:
  - ZN-118
ordinal: 40740
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build libzn_host_gfx.a (zrt, raster, ttf, null HAL, plugin objects) for aarch64-linux and armhf-linux with the pinned zig; download a checksummed sysroot (Debian or Alpine) for libdrm/gbm/EGL headers; `zinc build --target aarch64-linux examples/hero` links graphics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the cross-built hero runs headless under qemu-user and matches the golden frame
- [ ] #2 no Docker involved on macOS or Linux
<!-- AC:END -->
