---
id: ZN-211
title: 'RPI-BM4 Pi core: SD, FatFs, main.zbc autorun, ZN save'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FatFs from Circle; main.zbc and assets on the boot partition. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 with a FAT image boot runs main.zbc with no host; a font asset loads from FAT; ZN save then reboot runs the saved program
<!-- AC:END -->
