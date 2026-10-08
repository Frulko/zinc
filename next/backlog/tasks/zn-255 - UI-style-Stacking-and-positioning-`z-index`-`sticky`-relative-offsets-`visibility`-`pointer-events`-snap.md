---
id: ZN-255
title: >-
  UI style: Stacking and positioning: `z-index`, `sticky`, relative offsets,
  `visibility`, `pointer-events`, snap
status: Review
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:16'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies: []
ordinal: 50550
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-06). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hit test follows z order (pointer script on overlapping nodes).
- [x] #2 Sticky header golden at three scroll offsets.
- [ ] #3 Snap test: after release the offset equals a snap point, deterministic with the virtual clock.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. z-N / -z-N / z-[N] / z-auto (children painted in a stable z order, hit test in the reverse; a sticky box counts as z 1), relative (+ top/left/right/bottom shifts the box, the layout around it does not move), sticky + top-N (held at the top of the nearest scroll container, kept inside its parent; paint, hit test and screenBox agree), invisible / visible (keeps its room, not painted, not hit), pointer-events-none / auto (the point falls through to what lies below). Tests: tests/golden/ui-hit (red z 10 over green, blue pointer-events-none lets the point through, an invisible box is not hit; run in t1/ui_tokens.sh), scenes stacking and sticky-0 / sticky-50 / sticky-130 (header held at three scroll offsets, checked on the image), token fields in tests/golden/ui-tokens, all earlier scene hashes and the canary unchanged. NOT done: AC3 (scroll snap after release: it is ZN-256, the split of the snap part, which depends on this task); sticky bottom/left/right; visibility inherited with a child overriding it (invisible hides the subtree).
<!-- SECTION:NOTES:END -->
