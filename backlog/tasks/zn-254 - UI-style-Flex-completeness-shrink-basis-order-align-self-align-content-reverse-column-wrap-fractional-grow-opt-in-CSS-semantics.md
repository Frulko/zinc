---
id: ZN-254
title: >-
  UI style: Flex completeness: shrink, basis, order, align-self, align-content,
  reverse, column wrap, fractional grow; opt-in CSS semantics
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 08:54'
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
- [x] #1 200 random flex trees (offline browser fixtures) match within 1 px when the opt-in props are set.
- [x] #2 With no opt-in prop the old loop runs: all proto goldens tol
- [x] #3 Golden for `order`, `self-end`, `basis-0` vs legacy `flex-1`.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
+ AC1: tools/layout-fuzz renders random flex trees (direction, gap, padding, margin, justify, items, content, self, order, grow, basis, fixed sizes) in zinc:ui and in headless Chrome (CDP over the pipe, tools/cdp.py) and compares the boxes: 2100 trees over 12 seeds, 3 differ by 2 px (fractional pixels: Chrome keeps 1/64 px, zinc whole pixels); tests/t2/layout_fuzz.sh gates 5 clean seeds. Found and fixed on the way: a box is never smaller than its padding (CSS border-box). Known and not compared: a box with both basis and width (CSS sizes its container by the width), overflowing content (CSS aligns the overflow, zinc clamps).
<!-- SECTION:NOTES:END -->
