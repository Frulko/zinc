---
id: ZN-250
title: >-
  UI style: Property ids instead of string keys (`PROP` table,
  `Style{ids,values}`, `applyProp`)
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-07 15:19'
labels:
  - ui
  - style
  - size-M
  - parked
milestone: m-17
dependencies:
  - ZN-077
ordinal: 50500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-01). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every lowered style of the 41 manifest entries produces the same node state (dump compare `ui.dump()` before/after).
- [ ] #2 `jsx_style.sh` expectations regenerated, key names kept in diagnostics.
- [ ] #3 `applyNumber` string compares gone: style apply of 10k keys measured faster (before/after in the notes).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-07: ST-01 rewrites applyNumber/applyToken in lib/std/ui.ts, and the same hunks (applyNumber 417-442, setClass 660-700) carry another developer's uncommitted StyleSheet work (105 lines in the working tree). Changing them now would mix the two in one file I may not commit whole. Resume when that work is committed (git diff lib/std/ui.ts empty or only unrelated hunks). The layout tasks (ZN-280..) do not touch ui.ts and go first.
<!-- SECTION:NOTES:END -->
