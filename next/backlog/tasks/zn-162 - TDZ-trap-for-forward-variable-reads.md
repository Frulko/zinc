---
id: ZN-162
title: TDZ trap for forward variable reads
status: Review
assignee: []
created_date: '2026-10-07 00:13'
updated_date: '2026-10-08 01:50'
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
- [x] #1 reading a forward const before its declaration traps with its name, after it works
- [ ] #2 closure_names.ts leaves no live object
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC1 done: checker pre-pass (tdzPrepass) adds a per-module flag + __tdzChk (prelude) for top-level vars a function above the declaration mentions; reads from functions throw ReferenceError naming the variable, stores/updates are not checked; flag is module-local; the pre-pass also splices the program's flat list that lowering walks (that was the IR failure). tests/t0/tdz.sh; ir/zbc goldens of tuples/closures/exceptions regenerated (Error prelude now present). AC2 not done: a closure holding the cell that holds it cannot be freed at scope exit without escape analysis (the closure may escape); left to a cycle-aware rc or escape analysis.
<!-- SECTION:NOTES:END -->
