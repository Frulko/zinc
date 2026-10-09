---
id: ZN-510
title: 3DS rigid GPU skinning and 30 Hz simulation with interpolated presentation
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-496
ordinal: 300570
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An Island-class 3DS scene: rigid indexed skins with an affine palette in vertex uniforms (<= 29 joints, 87 vectors), a zero matrix to hide parts, visible index ranges coalesced, simulation at 30 Hz with poses interpolated and skinned once per display frame, two screens with a chat-style UI. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New 3DS hardware receipt: 60 fps with 2 animated characters and the island
- [ ] #2 No per-frame vertex upload for skins (counted)
- [ ] #3 Azahar goldens for both screens
<!-- AC:END -->
