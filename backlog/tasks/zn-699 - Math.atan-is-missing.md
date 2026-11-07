---
id: ZN-699
title: Math.atan is missing
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 21:52'
updated_date: '2026-11-07 16:39'
labels:
  - language
  - bug
  - size-S
dependencies: []
ordinal: 7200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the pinball editor: `Math.atan` is not known to the checker or the runtime (Math.atan2 is).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Math.atan and the other missing members of Math found by tools/dts-walk are present, with the oracle's values (golden)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch). The backend already had Math.atan (builtin, AtanF64 op): only the checker's Math object and lib/zinc.d.ts lacked it. The full ES2023 Math surface (MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math) also lacked asinh, acosh, atanh: added as builtins and three ZBC ops appended at the end of the opcode table (ids of the others unchanged, no ZBC version bump: an older engine refuses a module that uses them with 'unknown opcode', the way the earlier appended Math ops did). Spec: the hyperbolic and arc functions are implementation-approximated; libm's std::asinh/acosh/atanh, the golden compares toFixed(9). Golden tests/golden/run/math_inverse.ts/.out (values from Node 24), run by tests/t0/run.sh. Proof: interpreter, AOT (--native) and --engine quickjs print the golden; tests/run --only run PASS; tools/dts-walk 173 members, 0 fail. Not added: Math.f16round and Math.sumPrecise (ES2025+, not in TypeScript's default lib).
<!-- SECTION:NOTES:END -->
