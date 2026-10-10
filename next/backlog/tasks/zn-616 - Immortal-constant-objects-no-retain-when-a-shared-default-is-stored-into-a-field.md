---
id: ZN-616
title: >-
  Immortal constant objects: no retain when a shared default is stored into a
  field
status: Backlog
assignee: []
created_date: '2026-10-10 08:34'
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
