---
id: ZN-035
title: Array and string library for the lang tour
status: Done
assignee: []
created_date: '2026-10-06 09:14'
updated_date: '2026-10-06 10:04'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisite of ZN-017: map, filter, some, every, reduce, concat, slice(), for-of over strings and Map entries, padStart, replaceAll, parseInt, parseFloat, String.fromCharCode, Math.imul, truthiness of || on strings, multiple declarators, inferred variable types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed member behaves like Node on a golden program
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Library goldens match Node (library.ts); oracle accepts (now with the old compiler's tsc flags); ASan T1 green. Float-to-int implicit conversion added (needed by the tour); Math.atan removed (not in zinc.d.ts).
<!-- SECTION:NOTES:END -->
