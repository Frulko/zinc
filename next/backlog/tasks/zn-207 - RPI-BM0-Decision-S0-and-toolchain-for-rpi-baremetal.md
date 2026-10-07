---
id: ZN-207
title: RPI-BM0 Decision S0 and toolchain for rpi-baremetal
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decide the Circle GPLv3 question (own kernel + FatFs + TinyUSB as plan B); pin the Arm GNU toolchain, circle and circle-stdlib commits and a QEMU build in src/tc. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 licence decision recorded in decisions.md; the toolchain manager fetches and verifies the pinned set; circle-stdlib builds sample 01-gpiosimple; QEMU raspi3b prints a log line
<!-- AC:END -->
