---
id: ZN-251
title: 'UI style: Side records and move state colours out of `UiNode`'
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:05'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50510
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-02). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hover, focus, active, focus-within colour tests and the hero focus frame unchanged.
- [ ] #2 Bytes per node and a 171-node page measured with `zinc mem`: at least 15% lower.
- [ ] #3 A node with no extended property allocates no side record (assert in a T0 test).
<!-- AC:END -->
