---
id: ZN-358
title: 'Object styles: flex shorthand, flexShrink, flexBasis, alignSelf, alignContent'
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 15:21'
labels:
  - ui
  - style
  - rn
  - size-S
milestone: m-17
dependencies: []
ordinal: 50050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the React Native showcase (ZN-356): object styles accept only flexGrow and treat `flex` as grow. React Native's `flex: n` is grow n, shrink 1, basis 0 (and `flex: -1`), plus flexShrink, flexBasis (number, percent, auto), alignSelf, alignContent. The UiNode fields exist (shrink, basis, basisFrac, selfAlign, alignContent): the compiler's style lowering and the PROP table need the keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each key compiles in StyleSheet.create and inline objects and reaches its UiNode field (a test per key)
- [x] #2 `flex: 1` in rn mode gives equal shares with basis 0 (golden)
- [x] #3 classic keeps `flex` as grow only (goldens unchanged)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: object style keys flexShrink, flexBasis (number, percent, auto), alignSelf, alignContent (compiler src/frontend/jsx.cpp and PROP ids 55..59 in lib/std/ui.ts, which set the existing UiNode fields), and React Native's flex shorthand in the rn layout mode (grow n, shrink 1, basis 0; 0 rigid; -1 shrink only), resolved at compile time from UI_LAYOUT; classic keeps flex as grow. tests/t1/style_flex.sh: each key from StyleSheet.create and inline, rn.out and classic.out (identical except the flex-with-content row: rn 150/150, classic 190/110). docs/ui.md regenerated (tools/ui-docs) and its object-style section updated. Canary 4/4, tests/run --changed passed.
<!-- SECTION:NOTES:END -->
