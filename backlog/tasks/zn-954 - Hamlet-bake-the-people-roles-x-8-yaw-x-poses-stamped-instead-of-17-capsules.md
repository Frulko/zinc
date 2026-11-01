---
id: ZN-954
title: 'Hamlet: bake the people: roles x 8 yaw x poses, stamped instead of 17 capsules'
status: Backlog
assignee: []
created_date: '2026-11-01 13:03'
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
- [ ] #1 drawPerson uses the atlas; the live path stays as the fallback behind a flag
- [ ] #2 Diff test: atlas stamp vs live figure at integer positions, tolerance 0 on pixels and depth for 3 roles x 8 yaws (pngdiff or a buffer compare)
- [ ] #3 The scripted picture of hamlet.sh equals the previous golden within a documented tolerance (sub-pixel rounding only)
- [ ] #4 Bench: ms/frame at 60 people before/after logged; if the gain is below 20% the flag stays off and the number is in the notes
- [ ] #5 Bake of all frames takes under the budget printed by the test (sliced over frames at start, a 1-line 'preparing' text)
<!-- AC:END -->
