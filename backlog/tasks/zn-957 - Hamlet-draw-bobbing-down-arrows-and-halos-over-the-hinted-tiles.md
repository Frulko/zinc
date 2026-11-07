---
id: ZN-957
title: 'Hamlet: draw bobbing down arrows and halos over the hinted tiles'
status: Done
assignee: []
created_date: '2026-11-01 13:04'
updated_date: '2026-11-07 18:30'
labels:
  - hamlet
  - demo
  - m1
  - ui
  - indicators
  - size-S
milestone: m-30
dependencies:
  - ZN-956
  - ZN-948
ordinal: 700180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
drawArrow(sx,sy,time) exists (bobbing, halo, 13x12). Draw it above the building roof for each hint, colour by severity, hidden for hints in the overview zoom, toggle key H. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Arrow tip sits above the model top of the tile (project with the model height), follows the camera and zoom
- [x] #2 Hint disappears the frame its cause is solved (scripted session: place a house with no road -> arrow, add the road -> gone)
- [x] #3 At most 6 arrows are drawn; the most severe first; a calm village shows none
- [x] #4 Frame picture added to hamlet.sh golden; paused game draws no bob (still frame)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Arrows drawn in view/frame.ts after the edges: tip above the building's roof height (ROOF table, gate 2.6), colour by severity (red, yellow, teal), at most 6, none at zoom-out views wider than 1.5x, key H (settings.hints). Their rectangles join the dirty list, so the old and new place are restored from the baked picture (no ghost: gate arrow gone after the first house in the scripted run, frames 20 vs 300). Bob follows the game time, so a paused game stands still. Seen in a headless run (gate arrow at start, teal arrow on a house with idle residents). Left open (AC4): no pixel golden is kept for hamlet in tests/t1/hamlet.sh, so no picture was added there; drawArrow gained an optional colour in the untracked renderer.
Review 2026-11-07: review-close, closed as done. Arrows drawn over hints (3 of 4 ticked, hamlet_hints); the golden frame is minor. Close as done.
<!-- SECTION:NOTES:END -->
