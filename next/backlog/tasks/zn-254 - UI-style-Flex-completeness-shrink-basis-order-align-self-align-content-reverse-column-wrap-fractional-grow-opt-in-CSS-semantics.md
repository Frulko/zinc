---
id: ZN-254
title: >-
  UI style: Flex completeness: shrink, basis, order, align-self, align-content,
  reverse, column wrap, fractional grow; opt-in CSS semantics
status: Review
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:12'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-253
ordinal: 50540
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-05). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 200 random flex trees (offline browser fixtures) match within 1 px when the opt-in props are set.
- [x] #2 With no opt-in prop the old loop runs: all proto goldens tol
- [x] #3 Golden for `order`, `self-end`, `basis-0` vs legacy `flex-1`.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Added (all opt-in, nothing changes without them): grow-N / grow-[0.5] (grow is now a number), shrink / shrink-0 / shrink-[n] (weighted by size, only children that have it shrink), flex-none/auto/initial, basis-N / basis-1/2 / basis-full / basis-auto (replaces the measured main size, then grow shares what is left: basis-0 + grow gives equal columns where flex-1 shares by content), order-N / order-first / order-last (stable sort of one container's children in measure and place), self-start|center|end|stretch|auto, content-start|center|end|stretch|between|around|evenly (free space across wrapped lines), flex-row-reverse / flex-col-reverse (children reversed, start and end of justify swapped), column wrap (flex-col flex-wrap breaks into columns at the container height). Scenes flex-more (order, self-*, basis-0 grow 1:2:1, row-reverse, shrink) and flex-wrap2 (column wrap, content-between) checked on the image; token fields in tests/golden/ui-tokens + the JSX grammar cross-check; all existing scene hashes and the 4-entry pixel canary unchanged; tests/run --changed 6 passed. NOT done: AC1 (200 random trees against browser fixtures: no browser here), wrap-reverse, shrink re-wrapping text at the final width, inline style keys (flexShrink, order...) for the style objects.
<!-- SECTION:NOTES:END -->
