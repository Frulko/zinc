---
id: ZN-276
title: >-
  UI style: Accessibility styles and metadata: `role`, `aria-*`, `sr-only`, root
  font scale, forced-colours theme, contrast check
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-271
  - ZN-272
ordinal: 50760
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-27). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `ui.inspect` dumps role/label/hidden for a form (text expectation).
- [ ] #2 `ui.setRootFontSize(20)`: rem lengths scale, 16 leaves every proto golden unchanged.
- [ ] #3 A tool checks WCAG AA contrast of `LIGHT` and `DARK` kit themes and fails below 4.5:1 for text roles.
<!-- AC:END -->
