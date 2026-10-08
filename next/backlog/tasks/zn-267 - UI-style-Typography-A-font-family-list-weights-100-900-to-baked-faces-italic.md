---
id: ZN-267
title: >-
  UI style: Typography A: font family list, weights 100-900 to baked faces,
  italic
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 06:05'
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
- [ ] #1 A missing first family falls through the list (test with a missing asset).
- [ ] #2 The build bakes exactly the faces the app names (resource list test); proto text goldens tol
- [ ] #3 Synthetic italic golden; weight `500` maps to the nearest baked face deterministically.
<!-- AC:END -->
