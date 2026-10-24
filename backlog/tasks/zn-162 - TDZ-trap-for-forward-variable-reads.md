---
id: ZN-162
title: TDZ trap for forward variable reads
status: Backlog
assignee: []
created_date: '2026-10-07 00:13'
updated_date: '2026-10-25 01:53'
labels:
  - language
  - size-S
milestone: m-13
dependencies:
  - ZN-063
ordinal: 8200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** The TDZ part works (tests/t0/tdz.sh). The closure-cycle leak is still real (tests/t1/rc.sh:7 keeps closures.ts and closure_names.ts on the cyclic list, e.g. a button whose callback captures the button), and no other task or later.md line tracks cycle collection. 'Record if it matters' would lose a leak that long-running UI apps hit. Already there: tests/t0/tdz.sh; checker tdzPrepass; AC1 ticked.

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
Review 2026-10-25: done-partly. (review-close proposed, corrected by the verifier) The TDZ part works (tests/t0/tdz.sh). The closure-cycle leak is still real (tests/t1/rc.sh:7 keeps closures.ts and closure_names.ts on the cyclic list, e.g. a button whose callback captures the button), and no other task or later.md line tracks cycle collection. 'Record if it matters' would lose a leak that long-running UI apps hit. Evidence: tests/t0/tdz.sh; checker tdzPrepass; AC1 ticked
<!-- SECTION:NOTES:END -->
