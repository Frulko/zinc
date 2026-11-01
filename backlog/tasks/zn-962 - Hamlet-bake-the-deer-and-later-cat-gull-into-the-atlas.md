---
id: ZN-962
title: 'Hamlet: bake the deer (and later cat, gull) into the atlas'
status: Done
assignee: []
created_date: '2026-11-01 13:06'
updated_date: '2026-11-01 14:31'
labels:
  - hamlet
  - demo
  - m2
  - atlas
  - perf
  - size-S
milestone: m-30
dependencies:
  - ZN-954
ordinal: 720030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Same path as people: 8 yaws x (walk 8, graze 4, flee 6, dead 1). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deer drawn from the atlas; diff test vs live as for people
- [x] #2 Bench logged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (people and deer in one commit). actors.ts paints people (role x hair x 8 yaw x 18 poses: walk 8, chop 6, aim, fish, pick, idle) and deer (stag/doe x 8 yaw x 20 poses: walk 8, flee 6, graze 4 head levels, dead) through the same functions live or into the atlas (settings.atlas, default on). Frames bake on first use; the whole atlas (3184 frames) bakes in ~0.7 s, so no sliced 'preparing' text. Stamps equal live figures: deer 0 px differ in 80 cases, people at most 3 px (equal-depth ties flipped by float rounding) in 240 cases; idle breathing (hundredths of a unit, hair dependent) is dropped. Props (bow, line, bobber, carry, arrow) stay live at the quantised heading; axe and rod are in the frames. Shadows: 5 casts per person instead of one per bone. Bench (headless, 1100x900, 4 people + 20 deer, other trees building so noisy): normal view 21 -> 15 ms/frame draw, widest zoom-out 35 -> 24 ms. No golden exists for hamlet pixels; compared screenshots by eye (same look).
<!-- SECTION:NOTES:END -->
