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
ordinal: 50000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Do the sim backend and zinc:gpio API with a sim test; Linux chardev backend written, verified in the cross pass.

hw.h gains GPIO over the Linux GPIO uAPI v2: chip by label, line requests, bias, drive, edge events with kernel timestamps, kernel debounce, an explicit release policy. Linux, esp32 and sim backends. zinc:gpio (ZN-081) uses it on Linux targets. libgpiod is a test oracle only; the task notes record why (Bookworm v1 vs Trixie v2 ABI, LGPL). (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)

Also carries, since the backlog review of 2026-10-10: ZN-517 (zinc:gpio on Linux: GPIO v2 chardev, named lines, CHIP board table).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a gpio-sim test in the Linux CI image covers request, set/get, bias, edges and debounce
- [ ] #2 the same test passes on the Pi 3B+ with a jumpered pin pair
- [ ] #3 the Pi 5 label pinctrl-rp1 resolves through the probe table
- [ ] #4 no LGPL code linked
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. GPIO uAPI v2 in hw.h; the sim backend and zinc:gpio API are Mac-provable, Linux backend needs a board. Evidence: runtime/include/hw.h
<!-- SECTION:NOTES:END -->
