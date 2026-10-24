---
id: ZN-501
title: Strike-class FPS demo on PSP at 60 fps
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
  - parked
milestone: m-23
dependencies:
  - ZN-492
  - ZN-500
ordinal: 94600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A round-based FPS against bots on a free map, all in TypeScript (movement, weapons, bots, rounds, HUD) compiled AOT, with a 60 Hz fixed clock, analog movement, GE rendering of the PVS-visible batches with alpha-tested CLUT8, characters as GE morphs of two baked poses (VERTICES2), additive effects, viewmodel after a depth clear, vcount guard. Target: OpenStrike's locked 60 fps on PSP. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PPSSPP goldens for spawn, walk, fire
- [ ] #2 Hardware receipt: >= 59 fps over a 7,200-frame combat tape with 6 bots, worst warm frame recorded
- [ ] #3 CPU per frame split (game, UI, draw build) logged and compared with OpenStrike's 2.2 ms JS / 8.4 ms CPU
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
