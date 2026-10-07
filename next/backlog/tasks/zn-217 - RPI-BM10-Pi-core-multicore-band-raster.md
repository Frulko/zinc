---
id: ZN-217
title: 'RPI-BM10 Pi core: multicore band raster'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Core spin instead of the thread pool in render_bands.h. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frame CRC identical for 1 to 4 cores in QEMU; fps gain measured on the rig
<!-- AC:END -->
