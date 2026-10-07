---
id: ZN-162
title: TDZ trap for forward variable reads
status: Backlog
assignee: []
created_date: '2026-10-07 00:13'
labels:
  - language
  - size-S
milestone: m-13
dependencies:
  - ZN-063
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-063 lets functions use a top-level const declared below them. Reading it before its declaration runs yields the zero value; JavaScript throws ReferenceError. Add a per-variable initialised flag (only for variables an earlier function mentions) and a trap naming the variable. Also leaks: self-referential closures (cell holding its own closure) form reference cycles that rc does not free (closure_names.ts is on the cyclic list of tests/t1/rc.sh); break the cycle at scope exit if cheap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 reading a forward const before its declaration traps with its name, after it works
- [ ] #2 closure_names.ts leaves no live object
<!-- AC:END -->
