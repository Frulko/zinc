---
id: ZN-360
title: 'Object styles: shadowColor/Offset/Opacity/Radius and elevation'
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
ordinal: 50070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: no shadow key in object styles (the raster has a shadow primitive). React Native's iOS shadow props and Android elevation map to one box shadow (elevation as a preset curve); they draw outside the box, clipped by no ancestor overflow except a layer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the keys compile and draw a soft shadow under rounded boxes (golden)
- [ ] #2 elevation 1..24 follows a documented curve
- [ ] #3 the GL renderer draws the same shadow within the tolerance policy
<!-- AC:END -->
