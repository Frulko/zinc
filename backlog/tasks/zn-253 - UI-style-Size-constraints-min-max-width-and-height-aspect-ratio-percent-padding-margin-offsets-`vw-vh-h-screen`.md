---
id: ZN-253
title: >-
  UI style: Size constraints: min/max width and height, aspect-ratio, percent
  padding/margin/offsets, `vw/vh/h-screen`
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 08:54'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies: []
ordinal: 50530
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-04). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 40 generated cases equal the browser fixtures (+-1 px).
- [x] #2 Golden of a card grid with `aspect-video`, `max-w-md` centred.
- [x] #3 No allocation added to `measure` (count from ZN-189's counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
+ AC1: tools/layout-fuzz renders random flex trees (direction, gap, padding, margin, justify, items, content, self, order, grow, basis, fixed sizes) in zinc:ui and in headless Chrome (CDP over the pipe, tools/cdp.py) and compares the boxes: 2100 trees over 12 seeds, 3 differ by 2 px (fractional pixels: Chrome keeps 1/64 px, zinc whole pixels); tests/t2/layout_fuzz.sh gates 5 clean seeds. Found and fixed on the way: a box is never smaller than its padding (CSS border-box). Known and not compared: a box with both basis and width (CSS sizes its container by the width), overflowing content (CSS aligns the overflow, zinc clamps).
<!-- SECTION:NOTES:END -->
