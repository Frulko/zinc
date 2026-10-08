---
id: ZN-258
title: 'UI style: Outline, ring, `focus-visible`, customisable focus ring'
status: Review
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 08:45'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-257
  - ZN-228
ordinal: 50580
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-09). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default focus ring frame unchanged (hero golden).
- [x] #2 `ring-2 ring-indigo-500 ring-offset-2` golden; `focus-visible:` shows after keyboard, not after a mouse press (pointer-type test from ZN-228).
- [x] #3 Ring is one `border()` command (command-count assertion).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
+ AC3: command counts are asserted (tests/golden/ui-cmds, t1 ui_cmds) through the new zinc:gfx commandCount()/commandsFree() and ui.lastFrameCommands(): a ring is one border, an outline one more, underline and line-through one rrect each, a text shadow one more text run, and below 32 free commands the shadow is dropped.
<!-- SECTION:NOTES:END -->
