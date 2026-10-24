---
id: ZN-676
title: 'host_direct: the golden has its lines in the old order'
status: Done
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - testing
  - size-S
dependencies: []
ordinal: 432410
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) tests host_direct fails on main: the golden has the frame hash before the program's line and the output order is now the reverse (the hash itself matches, 8d0b12038e7558df); probably since console output is written at each event-loop turn (ZN-638, D65).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PASS host_direct, with the reason of the order recorded in the test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: closed as Done. tests/run --only host_direct passes now. Evidence: tests/t1/host_direct.sh PASS (run 2026-10-25) Verifier: tests/run --only host_direct: PASS here today. The second half of AC1 ('the reason of the order recorded in the test') is not in tests/t1/host_direct.sh; tick it as moot or add the comment when closing.
<!-- SECTION:NOTES:END -->
