---
id: ZN-270
title: 'UI style: Text shadow, selection colours, `user-select`'
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 08:45'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-259
  - ZN-268
ordinal: 50700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-21). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Offset shadow golden (two runs).
- [x] #2 `selection:bg-*` colours the field selection and a selectable static text (pointer test).
- [x] #3 T0 budget guard drops the shadow below 32 free commands.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
+ AC3: command counts are asserted (tests/golden/ui-cmds, t1 ui_cmds) through the new zinc:gfx commandCount()/commandsFree() and ui.lastFrameCommands(): a ring is one border, an outline one more, underline and line-through one rrect each, a text shadow one more text run, and below 32 free commands the shadow is dropped.
<!-- SECTION:NOTES:END -->
