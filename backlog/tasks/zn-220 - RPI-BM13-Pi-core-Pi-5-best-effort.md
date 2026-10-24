---
id: ZN-220
title: 'RPI-BM13 Pi core: Pi 5 best effort'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 92100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
UART, GPIO, Ethernet through Circle's RP1 drivers; no QEMU. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 manual hardware checklist recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Pi 5 is part of 'widest hardware', and no decision drops it. It is a parked tail of the open RPI-BM chain, the same case as ZN-217.
<!-- SECTION:NOTES:END -->
