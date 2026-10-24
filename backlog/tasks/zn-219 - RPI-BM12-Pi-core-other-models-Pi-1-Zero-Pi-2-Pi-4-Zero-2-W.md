---
id: ZN-219
title: 'RPI-BM12 Pi core: other models (Pi 1/Zero, Pi 2, Pi 4, Zero 2 W)'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 92000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-model images, config.txt and a size and limits table. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 per-model hello in QEMU (raspi0/1ap, raspi2b, raspi4b boot and UART only)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Bare-metal Raspberry Pi core. The Pi OS image builder, device agent and fast-boot image shipped, and cover the Pi for makers; the bare-metal core only buys boot time and needs Circle (GPLv3 question), a rig and no Mac proof. Park the chain; first step is ZN-207. Evidence: docs/reports/zinc-next-baremetal-pi.md; no firmware/rpi; image/ (Pi OS image) shipped
<!-- SECTION:NOTES:END -->
