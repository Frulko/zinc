---
id: ZN-363
title: 'Object styles: borderStyle, per-corner radii, per-side border colours'
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 18:30'
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
- [x] #1 each key compiles and renders (golden per key)
- [x] #2 classes and object keys give the same pixels for the same values
- [x] #3 the keys are listed in docs/ui.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: object keys borderStyle (enum solid/dashed/dotted), borderTopLeftRadius / TopRight / BottomRight / BottomLeft, borderTopColor / Right / Bottom / Left (PROP 76-84 into the classes' BorderX record; literal side colours through the @key:hex path, dynamic ones as numbers, conditionals of literals too). jsx.cpp colour detection by the Color suffix. tests/t1/style_border.sh: objects.tsx (with a dynamic radius and side colour) and classes.tsx give the same recorded frame hash. docs/ui.md lists the keys. tests/run --changed 40/40, proto-capture 4/4.
Difference kept: like React Native, a side colour alone draws nothing without a border width (the class border-t-red-500 implies 1 px).
<!-- SECTION:NOTES:END -->
