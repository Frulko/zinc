---
id: ZN-007
title: Binder and checker for the numeric subset
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 21:57'
labels:
  - size-L
milestone: m-1
dependencies:
  - ZN-005
  - ZN-006
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want types checked (numbers, functions, returns), so that a wrong program fails at compile time with a clear message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on a 30-file differential set, every program we accept is accepted by the oracle (`next/tools/oracle`); any violation is a bug; rejections of invalid fixtures carry a Z-code; notes record which parts were ported from the reference checker.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/frontend/check.{h,cpp}: binder (scopes, symbols, hoisting of functions/classes with deferred bodies) and checker (types per node, 13 new codes Z0101-Z0113 in the registry). zinc check --check|--types. Differential T1 oracle_diff: 43 files (17 ok programs, 23 error fixtures, 3 kernels), 0 violations; 28 extra adversarial snippets: 0 violations, 3 stricter by design (boolean conditions, array invariance). Ported from the old compiler: numeric result kinds (sema.ts arith, LNG-05), machine type names. NOT ported from tsgo (new, minimal): assignability, scopes, definite-return and constructor-initialisation analysis. Stricter than TS by design: boolean conditions, no uninitialised let, no inference of function results, array invariance. Limits (ponytail): builtin library is console/Math/Number.toFixed/array length,push,pop/string length; no generics, unions, arrows, objects, modules (Z0005). Oracle = repo tsc 7 + lib/zinc.d.ts, i32 aliases number. usage: 411857 in / 15516397 cached / 142711 out tokens, 122 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
