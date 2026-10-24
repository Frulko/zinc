---
id: ZN-616
title: >-
  Immortal constant objects: no retain when a shared default is stored into a
  field
status: Done
assignee: []
created_date: '2026-10-10 08:34'
updated_date: '2026-10-25 01:53'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
ordinal: 5160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-417: after borrowed parameters, the largest source of retains at hero's start is UiNode.constructor (13,770 of 56,398): each node stores ~15 shared sentinels from module constants into its fields (NO_LINES, NO_LINEW, NO_IDS, NO_SHEETS, DEF_RINGX, DEF_BORDERX, DEF_SNAPX, DEF_INTERX...), and a store takes a reference. Objects held by a top-level const that is never reassigned live until the program ends: make them immortal when the const is initialised (rc = kImmortal, as string constants are) and let the RC pass skip retain/release of values read from such globals. The program-end teardown must still release what an immortal constant holds, so zinc mem --check-leaks and the destruction order (tests/golden/rc/order.trace) stay as they are; record the rule in a decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero start (zinc mem, 1 frame): retains at least 20% below ZN-417's 56,398
- [ ] #2 rc (leaks over the corpus, destruction order) and rc_borrow pass; the ASan corpus is clean
- [ ] #3 decision recorded: which globals are immortal and when
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed without a change (decision D52, docs/reports/zinc-next-decisions.md). Measured on the Intel Mac, AOT: 2 M objects storing 6 shared sentinels each (12 M retains + 12 M releases) 125-132 ms against 89-91 ms storing null, about 1.5 ns per operation; hero's 13,770 sentinel retains at start are about 40 us of a 200 ms start. Immortal constants would need an end-of-program teardown that frees them last without double frees between constants that point at each other, and would change the frozen destruction order: risk without a visible gain. The acceptance criteria assumed retain counts are a cost; they are not at this size. Usage: n/a.
Review 2026-10-25: the open criteria are moot. Rejected by measurement.
<!-- SECTION:NOTES:END -->
