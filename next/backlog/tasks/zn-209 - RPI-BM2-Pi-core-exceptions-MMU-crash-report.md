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
ordinal: 70020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable Circle caches, route the exception handler to ZN log, watchdog reset into the loader window. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a deliberate null deref returns a trace and the core answers ZN ready again within a timeout; time to ready logged
<!-- AC:END -->
