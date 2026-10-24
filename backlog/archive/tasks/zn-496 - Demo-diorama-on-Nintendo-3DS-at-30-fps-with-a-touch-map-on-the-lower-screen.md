---
id: ZN-496
title: 'Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-492
  - ZN-495
ordinal: 231000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The diorama cooked for n3ds30, same TS program, with a top-down map and the controls on the lower touch screen. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Same source as the PSP demo with a 3DS layout of the UI
- [ ] #2 Hardware receipt: 90 s route, 0 late frames at 30 fps
- [ ] #3 Azahar goldens for both screens
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-492. Same diorama on the 3DS with a touch map. Verifier: ZN-492 is open; carry over the 3DS lower-screen touch map layout, the 90 s 30 fps hardware receipt and Azahar goldens of both screens.
<!-- SECTION:NOTES:END -->
