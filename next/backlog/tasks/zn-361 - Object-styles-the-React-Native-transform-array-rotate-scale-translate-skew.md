---
id: ZN-361
title: >-
  Object styles: the React Native transform array (rotate, scale, translate,
  skew)
status: Backlog
assignee: []
created_date: '2026-10-08 15:11'
labels:
  - ui
  - style
  - rn
  - size-M
milestone: m-17
dependencies: []
ordinal: 50080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: only translateX/Y and scale keys exist; React Native writes `transform: [{ rotate: '45deg' }, { scale: 1.2 }]`. Lower the array to the 2D transform of the node (rotation and skew included once the style task for 2D transforms lands), hit testing included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the array compiles with each entry kind, static and dynamic numbers
- [ ] #2 a rotated card hit-tests in its rotated shape (test)
- [ ] #3 goldens of rotate/scale/skew in rn mode
<!-- AC:END -->
