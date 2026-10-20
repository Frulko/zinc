---
id: ZN-359
title: >-
  Object styles: minWidth, maxWidth, minHeight, maxHeight, aspectRatio, dynamic
  percent sizes
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 15:36'
labels:
  - ui
  - style
  - rn
  - size-S
milestone: m-17
dependencies: []
ordinal: 50060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: min/max sizes and aspectRatio exist as classes but not as object style keys, and a percent width only works as a static string; React Native takes `width: '48%'` and numbers alike. Add the keys and a numeric percent path for dynamic values (widthPercent: 0.48 or a `pct(48)` helper).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the six keys compile static and dynamic
- [x] #2 a progress bar `width: pct(v())` follows v() (test)
- [x] #3 rn and classic both honour min/max (golden per engine)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: object style keys minWidth, maxWidth, minHeight, maxHeight (px, none/auto) and aspectRatio ('16/9' or a number), static and dynamic (PROP ids 60..64 set the UiNode fields), widthPercent/heightPercent as dynamic fractions, and `width: pct(v)` lowered by the compiler to a run-time percent (zinc:ui exports pct for code outside styles). tests/t1/style_size.sh: classic.out and rn.out (identical values: min/max, ratios 120x68 and 100x50, dynamic max 60 -> 140, pct 25 -> 80 % of 200). rn-showcase progress bars use pct() (stats hashes updated). docs/ui.md.
<!-- SECTION:NOTES:END -->
