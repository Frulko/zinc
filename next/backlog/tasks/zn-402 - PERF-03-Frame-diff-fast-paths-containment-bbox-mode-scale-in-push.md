---
id: ZN-402
title: 'PERF-03 Frame diff fast paths (containment, bbox mode, scale in push)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:33'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: medium
ordinal: 5020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/gfx.cpp:767-800 and raster.cpp:577-650: at 200k the diff phase is 4.4-4.8 ms per frame (diff_rects 2.86 ms), the largest main-thread item once the script is typed. Add a containment early return in damage_add (harness 2.06 ms), a bbox mode when the previous frame changed more than half its commands with the box accumulated in push() (harness 1.78 ms, near 0 with the box from push), and do the logical-to-physical scale in box()/push() instead of to_physical (0.3 ms at scale 4; plugin commands keep the pass).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 diff phase p50 <= 0.5 ms for 200k balls headless (baseline 4.4 ms)
- [ ] #2 damage stays a superset: damageCheck-style test over consecutive dumps of bouncing-ball, hero and navigation
- [ ] #3 UI demos with few changes keep exact damage rectangles (ZINC_VISUALIZE=damage unchanged)
<!-- AC:END -->
