---
id: ZN-210
title: 'RPI-BM3 Pi core: framebuffer and zinc:gfx host'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
32 bpp mailbox framebuffer, virtual-offset double buffer, band raster on core 0. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 QEMU screendump matches the pixel goldens within the comparator tolerance; CRC equals the desktop's
<!-- AC:END -->
