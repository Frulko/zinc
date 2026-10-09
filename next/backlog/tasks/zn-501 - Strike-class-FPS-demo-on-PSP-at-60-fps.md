---
id: ZN-501
title: Strike-class FPS demo on PSP at 60 fps
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-492
  - ZN-500
ordinal: 300480
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
