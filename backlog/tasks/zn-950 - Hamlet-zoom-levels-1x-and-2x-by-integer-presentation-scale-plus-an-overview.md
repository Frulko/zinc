---
id: ZN-950
title: 'Hamlet: zoom levels 1x and 2x by integer presentation scale, plus an overview'
status: Done
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
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S=10 is tuned (radii, dithers, edges); do not change it. Zoom in = smaller crop window at a bigger integer scale; the overview (zoom out) is the chunk composite decimated 2:1 with actors as dots. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Keys +/-, mouse wheel and pinch change zoom among 3 steps (overview 1/2, normal, close 2x); pointer maths correct at each step
- [x] #2 Zoom is centred on the pointer or screen centre and keeps the clamp
- [x] #3 The overview draws terrain, buildings and actors as dots only and costs no more than one composite
- [x] #4 Scripted session checks the tile under the pointer is unchanged by zoom in then out
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done. Zoom levels exist: setZoom/stepZoom, cite zoomAt (HamletScene.ts:23,54).
<!-- SECTION:NOTES:END -->
