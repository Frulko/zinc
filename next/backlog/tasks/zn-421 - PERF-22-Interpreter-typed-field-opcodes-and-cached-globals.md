---
id: ZN-421
title: 'PERF-22 Interpreter: typed field opcodes and cached globals'
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 09:03'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/vm/vm.cpp: L_SetField goes through op::setField (three dependent loads for fieldRef per store), L_GetGlobal through the globals vector, L_Rt through rtCall. Bouncing-ball 200k: interpreter 13.2 ms vs AOT 4.2 ms per frame. Add SetFieldS/SetFieldR chosen by the compiler from the field type, keep the globals data pointer in a loop local, test hostFast in L_Rt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bouncing-ball 200k interpreter script -25% (baseline 13.2 ms headless)
- [ ] #2 M4 interpreter kernels no regression; ZBC version check for older device cores
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed without a change (D53). Bench: a copy of examples/bouncing-ball spawning 199,999 balls at start; ZINC_HEADLESS=1 ZINC_FRAMES=120 ZINC_PROFILE=1 ZINC_RUN=interp ZINC_NO_CACHE=1, effects p50 (the onFrame script), idle Intel Mac, 3 alternations. Original 18.98-19.11 ms (AOT 8.22 ms; the 13.2 ms of the description was the M1). hostFast tested in L_Rt: 19.05-19.28 (rtCall tests it first anyway). Upper bound, SetField without the fieldRef look-up (unsafe for reference fields): 17.31-17.46 (-9%). Safe version (zbc::verify records the SetField positions whose field holds no reference, fuseAll rewrites them into an internal kSetFieldScalar handled by op::setFieldScalar): 20.51-20.87, and 20.49-20.55 with the rewrite switched off in that binary: the extra handler degrades the compiler's code for the whole dispatch loop. Reverted; the binary is byte-identical to the original. AC#1 (-25%) not reachable with these changes; AC#2 not applicable (no ZBC change). What would pay: fewer instructions per ball (about 45 at about 2 ns): constant globals as immediates, fused field updates, hoisting the per-ball width()/height() host calls when provably invariant. Usage: n/a.
<!-- SECTION:NOTES:END -->
