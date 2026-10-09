---
id: ZN-404
title: PERF-05 Fold top-level numeric const globals into constants
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A module-level const GRAVITY = 240 lowers to a global; every use is GetGlobal (AOT m.globals[k]: two dependent loads), 800k loads per frame in the 200k-ball update loop, and it blocks folding. IR pass in src/ir/opt.cpp: a global with a single SetGlobal of a Const in the module init and no other store becomes that Const at each GetGlobal; hoistConsts and CSE follow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 no GetGlobal of such globals in the AOT output of bouncing-ball and the M4 kernels
- [ ] #2 interpreter and AOT outputs byte-identical on the corpus
- [ ] #3 a golden test with a const read inside a loop and inside a closure
<!-- AC:END -->
