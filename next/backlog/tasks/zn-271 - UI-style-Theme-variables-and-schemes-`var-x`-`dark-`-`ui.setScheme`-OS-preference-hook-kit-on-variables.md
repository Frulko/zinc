---
id: ZN-271
title: >-
  UI style: Theme variables and schemes: `var(--x)`, `dark:`, `ui.setScheme`, OS
  preference hook, kit on variables
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 06:05'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-259
  - ZN-193
ordinal: 50710
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-22). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Switching scheme restyles only flagged nodes (count equals the flagged count) and re-renders no component.
- [ ] #2 Default light output unchanged (proto goldens); a dark golden of `examples/ui/kit-gallery`.
- [ ] #3 The theme table stays under 1 KiB and `zinc.json` can set the initial scheme.
<!-- AC:END -->
