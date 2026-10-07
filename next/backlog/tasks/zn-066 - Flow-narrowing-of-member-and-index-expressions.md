---
id: ZN-066
title: Flow narrowing of member and index expressions
status: Done
assignee: []
created_date: '2026-10-06 22:49'
updated_date: '2026-10-07 00:34'
labels:
  - language
  - size-M
milestone: m-13
dependencies:
  - ZN-065
ordinal: 40080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Narrow `this.f`, `a.b`, `a[i]` and `m.get(k)` after `if (x.f)`, `!== null`, `&&`, early return and `typeof`, with invalidation on assignment or on a call that may write the object (conservative rule written down). Today only local variables narrow: Z0105/Z0107 appear 13 times when lib/std/web.ts is checked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures for narrowing through if, &&, ||, ternary, early return, while; invalidation by assignment and by an opaque call
- [x] #2 lib/std/web.ts loses its Z0105/Z0107 diagnostics
- [x] #3 no new accepted-but-unsound program: oracle_diff clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Path keys generalise the old local.field facts; web.ts Z0105/Z0107 gone (it also needed: undefined compared with a nullable in files that use Dyn values is null). Rule recorded as D17. Remaining web.ts errors are record subtyping (extends/implements of records not assignable to the parent) and Blob members.
<!-- SECTION:NOTES:END -->
