---
id: ZN-034
title: 'console.log of objects, arrays, Map and Set (Node inspect format)'
status: Done
assignee: []
created_date: '2026-10-06 09:14'
updated_date: '2026-10-06 09:53'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisite of ZN-017: synthesised per-type formatters in Zinc source, single-line Node util.inspect format.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 console.log of arrays, objects, class instances, Map, Set, nested and null prints what Node prints (documented limits for lines over 72 columns)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Formatters generated as Zinc source; golden inspect (30 cases incl. grouping, line breaking, depth, subclasses, Map/Set, tuples) identical to Node; oracle accepts; ASan T1 green. Limits listed in RESUME.
<!-- SECTION:NOTES:END -->
