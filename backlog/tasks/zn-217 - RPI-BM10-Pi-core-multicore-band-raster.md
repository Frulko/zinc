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
ordinal: 91800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Core spin instead of the thread pool in render_bands.h. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frame CRC identical for 1 to 4 cores in QEMU; fps gain measured on the rig
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Already parked. No decision abandons the bare-metal Pi core (no bare-metal or Circle entry in zinc-next-decisions.md), and its chain ZN-207..216 is open. This is far, not useless, and the brief says far is park.
<!-- SECTION:NOTES:END -->
