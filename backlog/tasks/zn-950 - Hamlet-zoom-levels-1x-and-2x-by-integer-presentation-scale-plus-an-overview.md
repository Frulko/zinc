---
id: ZN-950
title: 'Hamlet: zoom levels 1x and 2x by integer presentation scale, plus an overview'
status: Backlog
assignee: []
created_date: '2026-11-01 13:01'
labels:
  - hamlet
  - demo
  - m1
  - map
  - ui
  - size-S
milestone: m-30
dependencies:
  - ZN-948
ordinal: 700110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S=10 is tuned (radii, dithers, edges); do not change it. Zoom in = smaller crop window at a bigger integer scale; the overview (zoom out) is the chunk composite decimated 2:1 with actors as dots. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Keys +/-, mouse wheel and pinch change zoom among 3 steps (overview 1/2, normal, close 2x); pointer maths correct at each step
- [ ] #2 Zoom is centred on the pointer or screen centre and keeps the clamp
- [ ] #3 The overview draws terrain, buildings and actors as dots only and costs no more than one composite
- [ ] #4 Scripted session checks the tile under the pointer is unchanged by zoom in then out
<!-- AC:END -->
