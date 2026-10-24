---
id: ZN-492
title: 'Demo: diorama flythrough on PSP, Vita and 3DS with a zinc:ui overlay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-486
  - ZN-491
ordinal: 52300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** One CC0 scene and one TS program cooked per profile (psp30, vita60, n3ds30); emulator goldens at three route marks; hardware receipt where the owner has the device. Carries ZN-494 and ZN-496.

First 3D demo: a small CC0 scene (for example a Kenney city or town kit) authored in TS with three.js on Zinc, cooked for psp30, flown on a fixed route at 30 fps with a zinc:ui title, menu and HUD drawn over it in the same program (no bridge). Reference for every later target. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PPSSPP goldens at three route marks with the UI over the scene
- [ ] #2 Hardware receipt: 150 s route, 0 late frames at 30 fps (or recorded with cause), worst frame logged
- [ ] #3 Package fits PSP-1000 user memory (about 24 MB) or the MEMSIZE requirement is stated
- [ ] #4 Source, cook command and receipts documented in examples/ and docs/
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. First 3D demo (diorama) for the three consoles: absorbs the Vita (494) and 3DS (496) ports as steps of one task. Evidence: no examples/diorama
Review 2026-10-25: merged ZN-494 here (Demo: diorama on PS Vita at 60 fps with 4x MSAA). Carry over: Same diorama on the Vita; a profile change of the PSP demo. ZN-492 is open; same program, profile change. Carry over the Vita bloom enhancement, the 60 fps 150 s hardware receipt and Vita3K goldens.
Review 2026-10-25: merged ZN-496 here (Demo: diorama on Nintendo 3DS at 30 fps with a touch map on the lower screen). Carry over: Same diorama on the 3DS with a touch map. ZN-492 is open; carry over the 3DS lower-screen touch map layout, the 90 s 30 fps hardware receipt and Azahar goldens of both screens.
<!-- SECTION:NOTES:END -->
