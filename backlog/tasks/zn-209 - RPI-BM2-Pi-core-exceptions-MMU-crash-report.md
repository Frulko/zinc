---
id: ZN-209
title: 'RPI-BM2 Pi core: exceptions, MMU, crash report'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 91000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable Circle caches, route the exception handler to ZN log, watchdog reset into the loader window. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a deliberate null deref returns a trace and the core answers ZN ready again within a timeout; time to ready logged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Bare-metal Raspberry Pi core. The Pi OS image builder, device agent and fast-boot image shipped, and cover the Pi for makers; the bare-metal core only buys boot time and needs Circle (GPLv3 question), a rig and no Mac proof. Park the chain; first step is ZN-207. Evidence: docs/reports/zinc-next-baremetal-pi.md; no firmware/rpi; image/ (Pi OS image) shipped
<!-- SECTION:NOTES:END -->
