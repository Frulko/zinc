---
id: ZN-283
title: 'Layout: Yoga wrapper: style mapping, tree ops, boxes'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
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
- [ ] #1 Every `UiNode` field of the section 5 table maps to a Yoga call (unit test per row).
- [ ] #2 `box()` returns parent-relative rounded boxes, and absolute conversion matches Yoga's `YGNodeLayoutGetLeft` sums.
- [ ] #3 Destroying nodes frees all Yoga memory (ASan/UBSan clean, heap equal before/after 1000 create/destroy cycles).
<!-- AC:END -->
