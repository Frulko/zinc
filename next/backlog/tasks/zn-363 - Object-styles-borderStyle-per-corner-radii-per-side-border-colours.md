---
id: ZN-363
title: 'Object styles: borderStyle, per-corner radii, per-side border colours'
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
ordinal: 50100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: React Native's borderStyle (solid, dashed, dotted), borderTopLeftRadius and the other corners, and borderTopColor and the other sides have no object keys, while the border model task gave the renderer these features.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each key compiles and renders (golden per key)
- [ ] #2 classes and object keys give the same pixels for the same values
- [ ] #3 the keys are listed in docs/ui.md
<!-- AC:END -->
