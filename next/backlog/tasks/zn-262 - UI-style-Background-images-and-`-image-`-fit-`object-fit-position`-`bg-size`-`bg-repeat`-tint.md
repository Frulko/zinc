---
id: ZN-262
title: >-
  UI style: Background images and `<image>` fit: `object-fit/position`,
  `bg-size`, `bg-repeat`, tint
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-182
  - ZN-251
ordinal: 50620
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-13). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `cover`, `contain`, `fill`, `none` goldens with a 2:1 image in a 1:1 box.
- [ ] #2 Repeat respects the command budget (16 tiles on esp32, test).
- [ ] #3 Tint multiplies on SW and GL within tolerance.
<!-- AC:END -->
