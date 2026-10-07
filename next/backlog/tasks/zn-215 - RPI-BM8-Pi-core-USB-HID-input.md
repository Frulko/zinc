---
id: ZN-215
title: 'RPI-BM8 Pi core: USB HID input'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keyboard, mouse and touch to gfx events through Circle's USB classes. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 QEMU -device usb-kbd + sendkey reaches a Zinc program; hardware: FT5x06 touch
<!-- AC:END -->
