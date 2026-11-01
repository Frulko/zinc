---
id: ZN-948
title: >-
  Hamlet: scrolling camera: pan with drag, arrow keys and screen edges over a
  larger map
status: Backlog
assignee: []
created_date: '2026-11-01 13:01'
labels:
  - hamlet
  - demo
  - m1
  - map
  - ui
  - size-M
milestone: m-30
dependencies:
  - ZN-947
ordinal: 700090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer has no camera (OX const, one 360x280 buffer). Projection is affine, so a baked layer can be shifted by whole pixels with a constant depth offset. Add a Camera(x,y) in hamlet and composite the baked world through it. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Camera pans by whole pixels; the visible window of a 48x48 map is drawn; pointer to tile maths (unproject) uses the camera offset
- [ ] #2 Drag with the right/middle button or two fingers, arrow keys/WASD, and edge scroll; clamped to the map
- [ ] #3 Hover outline, tools and indicators follow the camera (hamlet.sh scripted session: pan, then build at a screen position, the building lands on the tile under the pointer)
- [ ] #4 Picture at camera (0,0) on the 12x12 map is pixel-identical to today (pngdiff)
<!-- AC:END -->
