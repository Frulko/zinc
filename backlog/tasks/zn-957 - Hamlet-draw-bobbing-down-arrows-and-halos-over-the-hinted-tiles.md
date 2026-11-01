---
id: ZN-957
title: 'Hamlet: draw bobbing down arrows and halos over the hinted tiles'
status: Backlog
assignee: []
created_date: '2026-11-01 13:04'
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
- [ ] #1 Arrow tip sits above the model top of the tile (project with the model height), follows the camera and zoom
- [ ] #2 Hint disappears the frame its cause is solved (scripted session: place a house with no road -> arrow, add the road -> gone)
- [ ] #3 At most 6 arrows are drawn; the most severe first; a calm village shows none
- [ ] #4 Frame picture added to hamlet.sh golden; paused game draws no bob (still frame)
<!-- AC:END -->
