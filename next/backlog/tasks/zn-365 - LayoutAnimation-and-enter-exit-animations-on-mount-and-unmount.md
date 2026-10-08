---
id: ZN-365
title: LayoutAnimation and enter/exit animations on mount and unmount
status: Backlog
assignee: []
created_date: '2026-10-08 15:15'
labels:
  - ui
  - animation
  - rn
  - size-M
milestone: m-17
dependencies:
  - ZN-364
ordinal: 50070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
React Native's LayoutAnimation.configureNext(presets: easeInEaseOut, linear, spring) animates the next layout change (positions and sizes interpolated, created and deleted nodes faded or scaled), and enter/exit animations of mounted and unmounted nodes (the Reanimated layout animations idea, kept to RN's limits).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 configureNext before a state change animates moved nodes between their old and new boxes (golden frames at 0, 50 and 100 %)
- [ ] #2 removed nodes animate out before they leave the tree
- [ ] #3 works in classic and rn layout modes
<!-- AC:END -->
