---
id: ZN-676
title: 'host_direct: the golden has its lines in the old order'
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - testing
  - size-S
dependencies: []
ordinal: 432410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) tests host_direct fails on main: the golden has the frame hash before the program's line and the output order is now the reverse (the hash itself matches, 8d0b12038e7558df); probably since console output is written at each event-loop turn (ZN-638, D65).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PASS host_direct, with the reason of the order recorded in the test
<!-- AC:END -->
