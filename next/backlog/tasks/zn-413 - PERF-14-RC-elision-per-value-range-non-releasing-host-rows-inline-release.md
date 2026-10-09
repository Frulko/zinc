---
id: ZN-413
title: 'PERF-14 RC elision per value range, non-releasing host rows, inline release'
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:13'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: medium
ordinal: 5130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/ir/rc.cpp:76 lendsForever skips retain/release of borrowed loads only when the whole function has no call or runtime call. 200k balls: 400k retain/release pairs per frame (zinc mem: 4.6 M over 10 frames) for loop elements nothing can free; op::release is out of line (6% of navigation AOT). Check only each value's live range; flag runtime rows that never release program references; inline the release fast path; take the mem-stats test out of retain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no Retain/Release of the loop elements in bouncing-ball's update and draw loops
- [ ] #2 zinc mem retain count per frame at 200k balls < 1000 (baseline 400k)
- [ ] #3 ASan corpus clean, ZN_LEAK_CHECK and destruction-order goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From ZN-405/406: navigation AOT is 3.27 ms CPU per frame after them; the remaining -8% paint target of ZN-405 (3.5 ms baseline) depends on the release/arrPush share (~11% of samples) this task removes.
<!-- SECTION:NOTES:END -->
