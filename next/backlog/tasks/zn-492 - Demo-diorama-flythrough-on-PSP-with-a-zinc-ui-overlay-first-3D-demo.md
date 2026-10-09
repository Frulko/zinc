---
id: ZN-492
title: 'Demo: diorama flythrough on PSP with a zinc:ui overlay (first 3D demo)'
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
ordinal: 300390
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First 3D demo: a small CC0 scene (for example a Kenney city or town kit) authored in TS with three.js on Zinc, cooked for psp30, flown on a fixed route at 30 fps with a zinc:ui title, menu and HUD drawn over it in the same program (no bridge). Reference for every later target. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PPSSPP goldens at three route marks with the UI over the scene
- [ ] #2 Hardware receipt: 150 s route, 0 late frames at 30 fps (or recorded with cause), worst frame logged
- [ ] #3 Package fits PSP-1000 user memory (about 24 MB) or the MEMSIZE requirement is stated
- [ ] #4 Source, cook command and receipts documented in examples/ and docs/
<!-- AC:END -->
