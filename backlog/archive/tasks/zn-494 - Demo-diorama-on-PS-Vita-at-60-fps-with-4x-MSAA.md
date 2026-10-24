---
id: ZN-494
title: 'Demo: diorama on PS Vita at 60 fps with 4x MSAA'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-492
  - ZN-493
ordinal: 241000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PSP diorama cooked for vita60 with the same TS program and UI at density 2, plus one Vita-only enhancement (bloom on the previous frame at quarter resolution) to prove per-target techniques. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Same source as the PSP demo; only the profile differs
- [ ] #2 Hardware receipt: 150 s route, 0 late frames at 60 fps
- [ ] #3 Vita3K goldens of the UI (CPU oracle) and scene counters
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-492. Same diorama on the Vita; a profile change of the PSP demo. Verifier: ZN-492 is open; same program, profile change. Carry over the Vita bloom enhancement, the 60 fps 150 s hardware receipt and Vita3K goldens.
<!-- SECTION:NOTES:END -->
