---
id: ZN-358
title: 'Object styles: flex shorthand, flexShrink, flexBasis, alignSelf, alignContent'
status: Backlog
assignee: []
created_date: '2026-10-08 15:11'
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
- [ ] #1 each key compiles in StyleSheet.create and inline objects and reaches its UiNode field (a test per key)
- [ ] #2 `flex: 1` in rn mode gives equal shares with basis 0 (golden)
- [ ] #3 classic keeps `flex` as grow only (goldens unchanged)
<!-- AC:END -->
