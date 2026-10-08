---
id: ZN-270
title: 'UI style: Text shadow, selection colours, `user-select`'
status: Review
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 07:08'
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
- [ ] #2 `selection:bg-*` colours the field selection and a selectable static text (pointer test).
- [ ] #3 T0 budget guard drops the shadow below 32 free commands.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. text-shadow(-sm/md/lg/none/<colour>) drawn as a second text run (offset, black or tinted, alpha), selection:bg-* colours a field selection. Golden ui-style/text-shadow (checked visually), token rows, canary 4/4. Open: AC2 selectable static text and user-select (no static text selection exists yet), AC3 no free-command API in gfx for the budget guard (needs a runtime hook, see ZN-189/ZN-191).
<!-- SECTION:NOTES:END -->
