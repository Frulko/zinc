---
id: ZN-066
title: Flow narrowing of member and index expressions
status: Backlog
assignee: []
created_date: '2026-10-06 22:49'
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
- [ ] #1 fixtures for narrowing through if, &&, ||, ternary, early return, while; invalidation by assignment and by an opaque call
- [ ] #2 lib/std/web.ts loses its Z0105/Z0107 diagnostics
- [ ] #3 no new accepted-but-unsound program: oracle_diff clean
<!-- AC:END -->
