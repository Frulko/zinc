---
id: ZN-362
title: >-
  Object styles: dynamic enum and string values (fontWeight, display,
  textAlign...)
status: Done
assignee: []
created_date: '2026-10-08 15:11'
updated_date: '2026-10-08 18:25'
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
- [x] #1 a conditional between literals of an enum key compiles and switches at run time (test per key)
- [x] #2 a non-literal string is still a clear build error
- [x] #3 docs/ui.md lists which keys take dynamic values
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: jsx.cpp literalChoice: a conditional (nested) between literals of an enum key, a colour key (bg alias too, alpha kept) or any string-valued key lowers each branch through styleEntry to numbers on the same keys; fontWeight also takes a number (>= 600 bold); anything else is a build error naming the key. Test tests/t1/style_dynamic.sh (11 keys switch on one signal, the error message); docs/ui.md lists the keys. tests/run --changed 39/39.
Not done: numeric font weights only map to the bold flag (n.bold), like the static table; a 300 weight is not a face yet.
<!-- SECTION:NOTES:END -->
