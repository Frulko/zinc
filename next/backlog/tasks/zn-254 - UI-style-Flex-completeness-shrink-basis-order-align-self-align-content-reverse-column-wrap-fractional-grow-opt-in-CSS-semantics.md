---
id: ZN-254
title: >-
  UI style: Flex completeness: shrink, basis, order, align-self, align-content,
  reverse, column wrap, fractional grow; opt-in CSS semantics
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:05'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-253
ordinal: 50540
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-05). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 200 random flex trees (offline browser fixtures) match within 1 px when the opt-in props are set.
- [ ] #2 With no opt-in prop the old loop runs: all proto goldens tol
- [ ] #3 Golden for `order`, `self-end`, `basis-0` vs legacy `flex-1`.
<!-- AC:END -->
