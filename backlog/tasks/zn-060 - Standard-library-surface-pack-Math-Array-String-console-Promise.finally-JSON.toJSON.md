---
id: ZN-060
title: >-
  Standard library surface pack (Math, Array, String, console, Promise.finally,
  JSON.toJSON)
status: Done
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-06 23:44'
labels:
  - language
  - stdlib
  - size-S
milestone: m-13
dependencies: []
ordinal: 40020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make lib/zinc.d.ts (the prototype's reference list of supported members) true on the new engine: Math.sign/hypot/cbrt/log2/log10/log1p/expm1/fround/clz32/atan/asin/acos/sinh/cosh/tanh, global isNaN/isFinite/parseInt/parseFloat, Number statics, Array.at/flat/flatMap/copyWithin/from/of/entries/keys/values, String at/codePointAt/normalize(by task later)/localeCompare(simple), console.count/countReset/assert/table/time/timeEnd/timeLog/group/groupEnd/dir, Promise.prototype.finally (after L-await-expr), JSON.stringify honouring toJSON and the replacer/indent arguments, Set spread, Object.keys/values/entries on records. Diff the member list against lib/zinc.d.ts and tests/conformance to find the gaps; implement through runtime rows (include/zn/runtime.h) or Zinc prelude helpers, never ad hoc in the checker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a generated test walks every member of lib/zinc.d.ts and fails on any that does not compile (a list of deliberate exceptions with reasons is kept in the test)
- [x] #2 outputs of the new members equal Node's on a fixture per member (tests/golden/run/std_pack_*.ts)
- [x] #3 T0 and T1 pass; bench-m4 shows no regression above 5%
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Added Math cbrt/log2/log10/log1p/expm1/asin/acos/sinh/cosh/tanh/hypot/sign/fround/clz32, Array.at, Set.forEach, console.count/countReset/assert/time*/trace, Promise.finally; tools/dts-walk + t0 std_surface; exceptions: Console.table, Promise.catch probe artifact, Promise.reject (statics).
<!-- SECTION:NOTES:END -->
