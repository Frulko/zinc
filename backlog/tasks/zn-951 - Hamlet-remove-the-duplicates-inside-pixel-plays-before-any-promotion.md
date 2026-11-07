---
id: ZN-951
title: 'Hamlet: remove the duplicates inside pixel-plays before any promotion'
status: Backlog
assignee: []
created_date: '2026-11-01 13:02'
labels:
  - hamlet
  - demo
  - m1
  - pixel-plays
  - reuse
  - size-M
  - parked
milestone: m-30
dependencies:
  - ZN-940
ordinal: 700120
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third copy rule: terrain bake loop (harbor, fishing, hamlet), grass/water tones in 3 files, waterPixel vs waterPoint, drawTufts, drawSmoke, kind numbers, deer and birch living only in hamlet. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One bakeDiorama(radiusX, radiusY, classify) used by harbor, fishing and hamlet; their pngdiff goldens unchanged
- [ ] #2 One palette file (grass, water, sand, stone, wood) and one water-pixel helper; KIND_* constants exported by the renderer and no bare 1/2/4 left in the three games
- [ ] #3 tufts and the smoke helper exported once; hamlet/view/frame.ts drawTufts and actors.ts drawSmoke removed
- [ ] #4 deer and birch moved to models/animals.ts and models/trees.ts with parameters (x,y,yaw,state,phase,stag)
- [ ] #5 pixel-plays T1 tests and tests/t1/hamlet.sh pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: parked. (corrected: drop proposed; the Hamlet roadmap is the owner's (commit 489242bf9, New-task: owner): far from the goal, not useless (the 2026-10-25 rule for owner asks).)
<!-- SECTION:NOTES:END -->
