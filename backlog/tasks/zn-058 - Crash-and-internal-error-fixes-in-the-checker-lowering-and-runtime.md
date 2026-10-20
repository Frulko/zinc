---
id: ZN-058
title: 'Crash and internal-error fixes in the checker, lowering and runtime'
status: Done
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-06 23:13'
labels:
  - language
  - bug
  - size-S
milestone: m-13
dependencies: []
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parity audit 01 and 02 found: `zinc check` segfaults (exit 139) on an unknown static of Promise (Promise.race, allSettled, any) and when a member is read from an unresolved export (Checker::expr0, repro /tmp/parity/r/r14d.ts); 'internal error: invalid ZBC' for nullable numbers in a template or join; a u64 literal above i64 max clamps; an unhandled promise rejection is silent. Fix each at its root (guard error types in expr0, lower nullable numbers through the Dyn/formatter path, parse u64 literals as unsigned, report an unhandled rejection on stderr and exit 101 like an uncaught exception).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/golden fixtures for each of the four cases: the first two exit 1 with a diagnostic (Z0101 or Z0106), never 139; the third prints the same digits as Node; the fourth prints 18446744073709551615; the fifth ends with exit code 101 and the message
- [x] #2 an ASan build of zinc (cmake -DZN_SANITIZE=ON) checks every file of examples/ without a sanitizer report
- [x] #3 T0 and T1 pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Fixed: checker segfault (a symbol with no type now gives tError and a diagnostic), nullable number/boolean in templates and join (generated formatter; join prints empty for null like JS), exact 64-bit integer literals (u64 max, i64 beyond 2^53, negated literals), unhandled rejections (uncaught error, exit 101, after the microtasks drain). Promise statics are ZN-070 (L-promise). ASan zinc checked 69 example entry files clean.
<!-- SECTION:NOTES:END -->
