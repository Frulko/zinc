---
id: ZN-796
title: Typed numbers agree on --engine quickjs
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-13
dependencies: []
ordinal: 8500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-724: a typed program gives other numbers on `--engine quickjs` than on the interpreter: `i32` 2147483647 + 1 prints 2147483648 (interpreter -2147483648), `u8` 250 + 10 prints 260 (4), `f32` 0.1 + 0.2 prints 0.30000000000000004 (0.30000001192092896); `src/qjs/strip.cpp` blanks the types and emits no wrap or rounding. The engines are meant to agree; MicroTS wraps and rounds in its emitted JavaScript (docs/reports/microts-vs-zinc.md).
- From ZN-1009 (2026-11-08): a number assigned to an i32 is not truncated on QuickJS (`let z: i32 = 1; z = 7 / 2` prints 3.5, the interpreter and AOT 3); inferred i32 locals need the checker's types in the transform, the same mechanism as the wraps above.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 i32/u8 overflow wraps and f32 rounds on QuickJS as on the interpreter (2147483647+1, 250+10, 0.1f+0.2f), and i32 division truncates (`z = 7 / 2` is 3)
- [ ] #2 tools/diff-matrix shows no numeric DIFF for the QuickJS column on a new numeric fixture
- [ ] #3 no slowdown measured with bench-gate on the QuickJS kernels
<!-- AC:END -->
