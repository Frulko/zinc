---
id: ZN-021
title: Conformance 18/18 in the interpreter
status: Backlog
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 11:23'
labels:
  - size-S
milestone: m-3
dependencies: []
ordinal: 21900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: the 18 M3 programs (next/corpus/M3-set.txt) match their frozen goldens and live objects are 0 at exit where no cycle is built on purpose; report committed. Depends on the three gap tasks above.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 all frozen goldens match; report committed.
- [ ] #2 M3 demo: errors and async pass, live objects 0 at exit, destruction order equals current native
<!-- AC:END -->
