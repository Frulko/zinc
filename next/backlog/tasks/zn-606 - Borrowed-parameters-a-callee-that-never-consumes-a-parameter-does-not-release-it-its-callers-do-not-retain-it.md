---
id: ZN-606
title: >-
  Borrowed parameters: a callee that never consumes a parameter does not release
  it, its callers do not retain it
status: Backlog
assignee: []
created_date: '2026-10-09 14:49'
labels:
  - perf
milestone: m-21
dependencies: []
priority: medium
ordinal: 373270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-413 (D50). A load lent to a call still costs a retain in the caller and a release in the callee, because calls consume their arguments. When a function never consumes a parameter (no store, no return, no edge, no consuming call), the parameter can be borrowed: no release at the callee's end, no retain before the call. The convention must hold per function and per vtable slot (all overrides agree), and functions whose address is taken (closures, host callbacks) keep the owning convention. Measure on navigation's paint and on a method-heavy kernel (binarytrees) with ZN_NO_LEND-style A/B.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a non-inlined method called on a loop element (an array of objects) costs no retain or release in the loop (IR test)
- [ ] #2 run goldens, destruction order and the ASan corpus unchanged
- [ ] #3 navigation AOT CPU per frame measured before and after
<!-- AC:END -->
