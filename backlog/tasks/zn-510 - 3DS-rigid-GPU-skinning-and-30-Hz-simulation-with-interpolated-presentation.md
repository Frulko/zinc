---
id: ZN-510
title: 3DS rigid GPU skinning and 30 Hz simulation with interpolated presentation
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
  - parked
milestone: m-23
dependencies:
  - ZN-492
ordinal: 95000
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule). ZN-510 is moreover an engine technique (rigid GPU skinning, 0 B vertex upload per frame) for zinc:3d on the 3DS, not a game clone.
<!-- SECTION:NOTES:END -->
