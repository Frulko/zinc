---
id: ZN-417
title: PERF-18 Borrowed (+0) parameters including this
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-10 08:38'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-413
priority: medium
ordinal: 5170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rc.cpp:24 consumes(): a call consumes its arguments, so every call that passes an object it keeps retains it and the callee releases it (hero start: 153k retains for 2.4k allocations). Make parameters borrowed by default; the callee retains only what it stores or returns; change the RC pass and the native ABI together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc mem retains on hero start -50%
- [ ] #2 ui-heavy demo script time -10% (AOT)
- [x] #3 ASan corpus clean, native module ABI version bumped with tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done with ZN-606's design (D51 in docs/reports/zinc-next-decisions.md): borrowed parameters are inferred, not the default; the native module ABI is unchanged (native calls never consumed their arguments), so AC#3's ABI bump does not apply. src/ir/rc.cpp: Convention (per function and per vtable slot, greatest fixed point; selectors 'call' and '__errorString' keep owned parameters because runClosure, callComparator and exceptionText hand over a reference), consumesArg for call arguments, borrowed entry parameters untracked; storesRef + per-function/per-slot 'may store a reference' fixed point so a call of a function that cannot store keeps a load lent. ZN_NO_BORROW=1 restores the old convention (also in the run-cache signature). Measured, Intel Mac, examples/hero with ZINC_ASSETS (zinc mem): start 70,130 -> 56,398 retains (-20%; AC#1 asked -50%), 60 frames 324,597 -> 240,119 (-26%), allocations, frees and objects left identical. AOT, ZINC_PROFILE p50 over 300 frames, 3 alternations: maps/navigation paint 7.18 -> 7.05 ms (-2%; AC#2 asked -10%), hero app unchanged (0.12-0.13 ms). The remaining retains at hero's start are stores of shared sentinel objects into each UiNode's fields (UiNode.constructor 13,770 of 56,398, measured with a temporary per-function counter): ZN-616 (immortal constant objects). AC#3: ASan + UBSan build (build-asan, -DZN_SANITIZE=ON) over 132 programs (tests/golden/run, the M3 conformance set, bench kernels, examples/lang), interpreted: 0 reports. Tests: rc (no leak over the corpus, frozen destruction order), rc_lend, rc_refcast, ir, irformat, zbc (10 disassembly goldens regenerated: fewer RC ops, moved offsets), new tests/t0/rc_borrow.sh (fails on 3 of its checks with ZN_NO_BORROW=1). Also fixed on the way: the IR and ZBC listings stopped at a string holding a NUL (c3e9e1b4). Usage: n/a.
<!-- SECTION:NOTES:END -->
