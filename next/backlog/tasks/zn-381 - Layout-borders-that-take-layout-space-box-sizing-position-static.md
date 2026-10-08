---
id: ZN-381
title: 'Layout: borders that take layout space, box-sizing, position static'
status: Backlog
assignee: []
created_date: '2026-10-08 18:59'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap from the conformance corpus (ZN-289): 76 cases set borders that take layout space (Yoga's YGNodeStyleSetBorder; zinc:ui paints borders only, layout-engines.md section 4 item 12), 5 box-sizing content-box, 40 position static. In rn mode, send borderWidth and the side widths to Yoga as layout borders (React Native's semantics); classic keeps paint-only borders unless the react-native preset is on; add position 'static' and boxSizing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the border, box-sizing and static position cases pass in rn; demos unchanged (proto-capture compare --all)
<!-- AC:END -->
