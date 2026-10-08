---
id: ZN-270
title: 'UI style: Text shadow, selection colours, `user-select`'
status: Review
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 08:39'
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
- [ ] #3 T0 budget guard drops the shadow below 32 free commands.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Static text selection done: select-text / select-none tokens, a drag over a selectable Text selects by character (highlight selection:bg-* or the blue default), Cmd/Ctrl+C copies the selected text (lines of a wrapped paragraph joined by a space), a press elsewhere or a text change clears it; tests/golden/ui-select (pointer + clipboard) and the screenshot checked. Still open: AC3 (a free-command API for the shadow budget guard); select-all on click, double-click word selection.
<!-- SECTION:NOTES:END -->
