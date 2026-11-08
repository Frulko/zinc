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
ordinal: 94400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FatFs from Circle; main.zbc and assets on the boot partition. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 with a FAT image boot runs main.zbc with no host; a font asset loads from FAT; ZN save then reboot runs the saved program
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Bare-metal Raspberry Pi core. The Pi OS image builder, device agent and fast-boot image shipped, and cover the Pi for makers; the bare-metal core only buys boot time and needs Circle (GPLv3 question), a rig and no Mac proof. Park the chain; first step is ZN-207. Evidence: docs/reports/zinc-next-baremetal-pi.md; no firmware/rpi; image/ (Pi OS image) shipped
Review 2026-11-07: parked. Bare-metal Pi core (Circle): parked chain, needs a Pi and a licence decision; the Pi runs the Linux image now.
<!-- SECTION:NOTES:END -->
