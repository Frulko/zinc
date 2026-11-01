---
id: ZN-947
title: 'Hamlet: map size as data: width and height in the world, not constants'
status: Backlog
assignee: []
created_date: '2026-11-01 13:01'
labels:
  - hamlet
  - demo
  - m1
  - map
  - size-M
milestone: m-30
dependencies:
  - ZN-939
ordinal: 700080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GRID becomes world.w and world.h (arrays sized at generate/restore time). Up to 64x64 tiles must work in the simulation (path, jobs, save) even before the camera exists. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No import of GRID/HALF remains in world/, rules/, engine/, view/; tileX/tileY/neighbor use world.w/h
- [ ] #2 generate(seed, w, h) works for 12x12 (identical output to today for seed 1) and 48x48
- [ ] #3 Pathfinding and job assignment on 48x48 with 40 people stay under a budget measured with the bench of the baseline task (written in the test)
- [ ] #4 Save H2 stores w and h
<!-- AC:END -->
