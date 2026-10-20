---
id: ZN-283
title: 'Layout: Yoga wrapper: style mapping, tree ops, boxes'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 14:06'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-280
  - ZN-282
ordinal: 50730
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-4). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every `UiNode` field of the section 5 table maps to a Yoga call (unit test per row).
- [x] #2 `box()` returns parent-relative rounded boxes, and absolute conversion matches Yoga's `YGNodeLayoutGetLeft` sums.
- [x] #3 Destroying nodes frees all Yoga memory (ASan/UBSan clean, heap equal before/after 1000 create/destroy cycles).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: src/host/layout_yoga.cpp (zn::host::makeYogaLayout, one YGNode per handle in a table, web or RN defaults, point scale 1); LayoutProp gains the side-record fields from 1000 (full w/h, min/max, aspect, basis, shrink, align-self, align-content, reverse, gap-x/y, contents) with their encodings in layout.h. tests/t0/layout_yoga.sh: one check per row of the section 5 table (row/wrap/reverse, justify 0..5, align 0..3 and self, grow, full, padding/margin/gap, sizes/percent/min/max/aspect, basis/shrink/align-content, absolute insets, scroll, hidden, contents), rounded parent-relative boxes and the absolute sums, heap equal after 1000 create/destroy cycles (a mutation that skips YGNodeFree fails it), and the same test under ASan+UBSan with Yoga's sources (11 s). zig c++ -Wall -Wextra clean. Text/image/field measure: setMeasure records the ids only, the callbacks are ZN-284. Learned: with web defaults a fixed-size item shrinks into a column scroll view (CSS behaviour); ZN-286 must set shrink 0 on scroll content to match classic.
<!-- SECTION:NOTES:END -->
