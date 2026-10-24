---
id: ZN-147
title: 'Fuzzing: parser, checker, ZBC decoder and verifier, native ABI'
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
updated_date: '2026-10-25 01:53'
labels:
  - security
  - tests
  - size-M
milestone: m-12
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
libFuzzer targets with ASan/UBSan for the lexer/parser, the checker (on mutated corpus programs), zbc::decode+verify and the native ABI argument decoding; a corpus built from tests/golden; a short run gate in T2 (60 s per target) and a documented long-run recipe; crashes become regression tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each target runs 10 minutes clean on the corpus; every crash found is fixed with a regression fixture
- [x] #2 docs/reports/zinc-next-fuzzing.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Four libFuzzer targets (tools/fuzz, tests/fuzz, T2 gate tests/t2/fuzz.sh). Fixed: ZBC class flags, quadratic IR verifier dominators (3 s -> 0.14 s), untyped lvalue in the checker. 10-minute runs: parse, zbc, native clean; check found one more failure (duplicate nested/top-level names -> invalid IR), open, fixture in tests/fuzz/regress. AC1 not met until it is fixed.
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) The duplicate-names crash is not fixed: `zinc run tests/fuzz/regress/check-dup-names-invalid-ir.ts` prints 'internal error: invalid IR after reference counting: @main bb1 inst 3: setfield value type differs' (exit 3), which is the defect itself, not a diagnostic. tests/t0/fuzz_regress.sh only checks that exit is below 124, so it passes. The reviewer's note is also wrong: fuzz_regress PASSes under tests/run (ZINC_STEPS=0 removes the banner). Evidence: tests/fuzz/; tests/t0/fuzz_regress.sh; tests/t2/fuzz.sh; docs/reports/zinc-next-fuzzing.md; commit 686cfb60
<!-- SECTION:NOTES:END -->
