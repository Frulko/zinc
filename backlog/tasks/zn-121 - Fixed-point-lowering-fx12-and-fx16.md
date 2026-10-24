---
id: ZN-121
title: 'Fixed-point lowering: fx12 and fx16'
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-25 01:53'
labels:
  - profiles
  - size-L
milestone: m-11
dependencies:
  - ZN-120
ordinal: 52700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An IR pass that lowers fx12/fx16 values to integer ops with the exact rounding of sim/fx_sin.mjs and runtime/fx_sin.h (shared semantics in include/zn/ops.h), sin/cos tables, conversions, printing; interpreter and AOT share the ops.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 all tests/conformance/*.fx12.out programs pass under `--profile ps1` in the interpreter and in AOT
- [ ] #2 no f64 operation remains in the lowered IR of those programs (checked by the verifier in fx profiles)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Split into 121.01 (checker), 121.02 (IR/ZBC/interpreter), 121.03 (AOT + goldens), 121.04 (verifier): fixed point is a numeric family of its own (the prototype's Fx<F> in runtime/zrt_ext.h: mul (int64)>>F, div, table sin/cos, integer sqrt, conversions through double, printing through the double). The ACs of this task are met when the four children are Done.
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) AC2 (no f64 left in the lowered IR) is not met: ZN-121.04 notes say 12 of 25 programs are still flagged, and part of that is a real lowering gap (Number.isNaN/isFinite lowered as f64 compares), not measurement noise. The umbrella's own notes say it is done only when all four children are Done. Evidence: tests/t1/fixed.sh; tests/t1/fixed_verify.sh; tests/t2/fixed_aot.sh; ZN-121.02/.03 Done
<!-- SECTION:NOTES:END -->
