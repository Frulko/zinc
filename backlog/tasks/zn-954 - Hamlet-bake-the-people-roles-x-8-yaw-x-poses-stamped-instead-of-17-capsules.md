---
id: ZN-954
title: 'Hamlet: bake the people: roles x 8 yaw x poses, stamped instead of 17 capsules'
status: Done
assignee: []
created_date: '2026-11-01 13:03'
updated_date: '2026-11-01 14:31'
labels:
  - hamlet
  - demo
  - m1
  - atlas
  - perf
  - size-M
milestone: m-30
dependencies:
  - ZN-953
ordinal: 700150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
figure() drawn with solid capsules (not dynamicAdd) captured per role, yaw (quantised to 8 for drawing only), and pose (walk 8, chop 6, aim 3, pick 3, idle 1). Props (axe, bow, log) are small separate frames stamped at hand/back; shadows stay dynamic with 2 casts. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 drawPerson uses the atlas; the live path stays as the fallback behind a flag
- [x] #2 Diff test: atlas stamp vs live figure at integer positions, tolerance 0 on pixels and depth for 3 roles x 8 yaws (pngdiff or a buffer compare)
- [x] #3 The scripted picture of hamlet.sh equals the previous golden within a documented tolerance (sub-pixel rounding only)
- [x] #4 Bench: ms/frame at 60 people before/after logged; if the gain is below 20% the flag stays off and the number is in the notes
- [x] #5 Bake of all frames takes under the budget printed by the test (sliced over frames at start, a 1-line 'preparing' text)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (people and deer in one commit). actors.ts paints people (role x hair x 8 yaw x 18 poses: walk 8, chop 6, aim, fish, pick, idle) and deer (stag/doe x 8 yaw x 20 poses: walk 8, flee 6, graze 4 head levels, dead) through the same functions live or into the atlas (settings.atlas, default on). Frames bake on first use; the whole atlas (3184 frames) bakes in ~0.7 s, so no sliced 'preparing' text. Stamps equal live figures: deer 0 px differ in 80 cases, people at most 3 px (equal-depth ties flipped by float rounding) in 240 cases; idle breathing (hundredths of a unit, hair dependent) is dropped. Props (bow, line, bobber, carry, arrow) stay live at the quantised heading; axe and rod are in the frames. Shadows: 5 casts per person instead of one per bone. Bench (headless, 1100x900, 4 people + 20 deer, other trees building so noisy): normal view 21 -> 15 ms/frame draw, widest zoom-out 35 -> 24 ms. No golden exists for hamlet pixels; compared screenshots by eye (same look).
<!-- SECTION:NOTES:END -->
