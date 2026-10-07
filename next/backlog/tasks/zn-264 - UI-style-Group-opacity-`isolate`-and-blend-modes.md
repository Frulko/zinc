---
id: ZN-264
title: 'UI style: Group opacity (`isolate`) and blend modes'
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
  - ZN-178
ordinal: 50640
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-15). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Overlap scene differs from per-primitive opacity exactly as CSS group opacity (golden).
- [ ] #2 add, multiply, screen exact on SW, GL via `glBlendFunc` within tolerance.
- [ ] #3 PS1 maps add/sub or degrades to normal with a log line.
<!-- AC:END -->
