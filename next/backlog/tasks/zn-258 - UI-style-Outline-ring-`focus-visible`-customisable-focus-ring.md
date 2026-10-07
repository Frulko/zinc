---
id: ZN-258
title: 'UI style: Outline, ring, `focus-visible`, customisable focus ring'
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
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
- [ ] #1 Default focus ring frame unchanged (hero golden).
- [ ] #2 `ring-2 ring-indigo-500 ring-offset-2` golden; `focus-visible:` shows after keyboard, not after a mouse press (pointer-type test from ZN-228).
- [ ] #3 Ring is one `border()` command (command-count assertion).
<!-- AC:END -->
