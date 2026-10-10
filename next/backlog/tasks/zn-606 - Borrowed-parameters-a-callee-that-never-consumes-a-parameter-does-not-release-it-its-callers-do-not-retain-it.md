---
id: ZN-606
title: >-
  Borrowed parameters: a callee that never consumes a parameter does not release
  it, its callers do not retain it
status: Done
assignee: []
created_date: '2026-10-09 14:49'
updated_date: '2026-10-10 08:38'
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
- [x] #1 a non-inlined method called on a loop element (an array of objects) costs no retain or release in the loop (IR test)
- [x] #2 run goldens, destruction order and the ASan corpus unchanged
- [x] #3 navigation AOT CPU per frame measured before and after
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done together with ZN-417 (D51): the convention per function and per vtable slot, owned for what the runtime calls, and a call of a function that cannot store a reference keeps a loop element lent (tests/t0/rc_borrow.sh: Shelf.total has no retain or release of the element around it.weight()). Run goldens, destruction order (rc) and the ASan corpus (132 programs, 0 reports) unchanged. maps/navigation AOT paint p50 7.18 -> 7.05 ms per frame (ZN_NO_BORROW=1 against the default, 300 frames, 3 alternations). Usage: n/a.
<!-- SECTION:NOTES:END -->
