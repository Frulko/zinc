---
id: ZN-359
title: >-
  Object styles: minWidth, maxWidth, minHeight, maxHeight, aspectRatio, dynamic
  percent sizes
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
ordinal: 50060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: min/max sizes and aspectRatio exist as classes but not as object style keys, and a percent width only works as a static string; React Native takes `width: '48%'` and numbers alike. Add the keys and a numeric percent path for dynamic values (widthPercent: 0.48 or a `pct(48)` helper).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the six keys compile static and dynamic
- [ ] #2 a progress bar `width: pct(v())` follows v() (test)
- [ ] #3 rn and classic both honour min/max (golden per engine)
<!-- AC:END -->
