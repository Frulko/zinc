---
id: ZN-208
title: 'RPI-BM1 Pi core: UART + ZBC VM hello on raspi3b'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 90900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
firmware/rpi/main.cpp following the ESP32 pattern (Circle CSerialDevice feeds zn::dev::Core::feed), built with ZN_NO_MIMALLOC against newlib and libc++. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/t2/rpi3_qemu.sh: zinc run hello.ts --target rpi3 --qemu prints hello and 'done 0 0'; the library golden passes; an uncaught exception gives status 101
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Bare-metal Raspberry Pi core. The Pi OS image builder, device agent and fast-boot image shipped, and cover the Pi for makers; the bare-metal core only buys boot time and needs Circle (GPLv3 question), a rig and no Mac proof. Park the chain; first step is ZN-207. Evidence: docs/reports/zinc-next-baremetal-pi.md; no firmware/rpi; image/ (Pi OS image) shipped
<!-- SECTION:NOTES:END -->
