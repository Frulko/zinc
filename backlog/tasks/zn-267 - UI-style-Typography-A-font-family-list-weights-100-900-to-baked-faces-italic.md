---
id: ZN-267
title: >-
  UI style: Typography A: font family list, weights 100-900 to baked faces,
  italic
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 06:58'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-114
ordinal: 50670
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-18). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A missing first family falls through the list (test with a missing asset).
- [x] #2 The build bakes exactly the faces the app names (resource list test); proto text goldens tol
- [x] #3 Synthetic italic golden; weight `500` maps to the nearest baked face deterministically.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. font-[A,B] family list falls through (missing first family), weights thin..black map to the nearest baked face (lighter first below 600, heavier from 600), italic/not-italic = real Family-Italic face or baked slant (Name~i, 12 degrees, baked when the app uses italic; runtime TTF fonts for HiDPI slant too). Res bake drops unnamed weight/italic asset faces. Tests: ui_font (golden/ui-font), ui-style/italic scene, token rows; canary 4/4. Gaps: style-object numeric fontWeight, no italic for the baked grid font.
<!-- SECTION:NOTES:END -->
