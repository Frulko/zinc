---
id: ZN-402
title: 'PERF-03 Frame diff fast paths (containment, bbox mode, scale in push)'
status: Done
assignee: []
created_date: '2026-10-09 07:33'
updated_date: '2026-10-09 08:30'
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
- [x] #1 diff phase p50 <= 0.5 ms for 200k balls headless (baseline 4.4 ms)
- [x] #2 damage stays a superset: damageCheck-style test over consecutive dumps of bouncing-ball, hero and navigation
- [x] #3 UI demos with few changes keep exact damage rectangles (ZINC_VISUALIZE=damage unchanged)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
damage_add returns at once when the rectangle is already inside one (same result, order kept); diff_rects past 4096 changed commands grows one box instead of joining rectangles (bulk_after parameter, reports the change count); end_frame enters a bulk mode when the last diff was bulk: the damage is the union of everything the two frames draw (raster::bounds_all, cached per buffer, stops at the first CLEAR/CLIP/UNCLIP whose bounds are the screen), with a full diff every 16th frame to leave the mode.
Measured, bouncing-ball 200k balls headless (ZINC_PROFILE=1): diff p50 2.86 -> 0.00 ms (p99 1.9 ms: the full diff of every 16th frame), work p50 5.58 -> ~3.4 ms. Window: 74 -> 89.5 fps (prototype ~30).
Tests: damage_sig now also checks that the bulk damage (diff_rects past the threshold, and the union of both frames' bounds) covers the exact rectangles, on hero, navigation and bouncing-ball; ZINC_VISUALIZE=damage frames of hero and kit-gallery identical before/after (30 frames, all hashes); tests/run --changed 44/44. The scale-in-push part is split into the follow-up task.
usage: n/a
<!-- SECTION:NOTES:END -->
