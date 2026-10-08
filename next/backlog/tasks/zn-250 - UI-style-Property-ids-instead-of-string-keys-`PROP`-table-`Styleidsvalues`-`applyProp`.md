---
id: ZN-250
title: >-
  UI style: Property ids instead of string keys (`PROP` table,
  `Style{ids,values}`, `applyProp`)
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 05:56'
labels:
  - ui
  - style
  - size-M
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
- [x] #1 Every lowered style of the 41 manifest entries produces the same node state (dump compare `ui.dump()` before/after).
- [x] #2 `jsx_style.sh` expectations regenerated, key names kept in diagnostics.
- [x] #3 `applyNumber` string compares gone: style apply of 10k keys measured faster (before/after in the notes).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. lib/std/ui.ts: a PROP table (key to id, aliases share one id), propId(key) looked up once when a Style or a setNumber meets a key, Style.ids, node styleIds/sheetIds, applyProp(n, id, key, v) compares integers; applyNumber(key) kept as the wrapper; interaction keys (grab, dragAxis, tabIndex, disabled) keep their names (id 0). Neutral: all 42 proto pixel entries match at tolerance 0, jsx_style, ui, ui_style, examples_all pass; lowering still emits string keys so diagnostics keep them. Measured (AOT, 8M setNumber applies over 20 keys, same program, old vs new ui.ts): 2.6-2.7 s -> 1.6-1.8 s (-38%); in the interpreter no visible difference (0.5 s for 400k both).
<!-- SECTION:NOTES:END -->
