---
id: ZN-121
title: 'Fixed-point lowering: fx12 and fx16'
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
labels:
  - profiles
  - size-L
milestone: m-11
dependencies:
  - ZN-120
ordinal: 40630
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
