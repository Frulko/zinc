---
id: ZN-362
title: >-
  Object styles: dynamic enum and string values (fontWeight, display,
  textAlign...)
status: Backlog
assignee: []
created_date: '2026-10-08 15:11'
labels:
  - ui
  - style
  - rn
  - size-S
milestone: m-17
dependencies: []
ordinal: 50090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-356: `fontWeight: on() ? 700 : 400` and `display: c ? 'flex' : 'none'` are build errors; only numbers may be dynamic, so the showcase used conditional named styles. Accept numeric font weights dynamically and enum strings through a compile-time table of their values (a conditional of literals lowers to the numeric codes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a conditional between literals of an enum key compiles and switches at run time (test per key)
- [ ] #2 a non-literal string is still a clear build error
- [ ] #3 docs/ui.md lists which keys take dynamic values
<!-- AC:END -->
