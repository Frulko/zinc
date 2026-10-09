---
id: ZN-549
title: 'GPIO chardev v2 backend in hw.h and the real zinc:gpio'
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-081
  - ZN-126
  - ZN-535
ordinal: 340150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
hw.h gains GPIO over the Linux GPIO uAPI v2: chip by label, line requests, bias, drive, edge events with kernel timestamps, kernel debounce, an explicit release policy. Linux, esp32 and sim backends. zinc:gpio (ZN-081) uses it on Linux targets. libgpiod is a test oracle only; the task notes record why (Bookworm v1 vs Trixie v2 ABI, LGPL). (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a gpio-sim test in the Linux CI image covers request, set/get, bias, edges and debounce
- [ ] #2 the same test passes on the Pi 3B+ with a jumpered pin pair
- [ ] #3 the Pi 5 label pinctrl-rp1 resolves through the probe table
- [ ] #4 no LGPL code linked
<!-- AC:END -->
