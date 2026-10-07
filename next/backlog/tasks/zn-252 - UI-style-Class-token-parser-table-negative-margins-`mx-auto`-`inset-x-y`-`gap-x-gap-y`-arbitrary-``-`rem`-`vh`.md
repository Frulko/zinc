---
id: ZN-252
title: >-
  UI style: Class-token parser table: negative margins, `mx-auto`, `inset-x/y`,
  `gap-x/gap-y`, arbitrary `%`, `rem`, `vh`
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50520
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-03). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 parser test accepts and rejects a list of 60 tokens (accepted ones set the expected fields, unknown ones keep the diagnostic).
- [ ] #2 `gap-x-4 gap-y-2` golden on a wrapped row.
- [ ] #3 `isKnownClass` and the docs table generated from the same table.
<!-- AC:END -->
