---
id: ZN-667
title: >-
  Compiler: a nested and a top-level declaration with the same name give invalid
  IR
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 18:50'
updated_date: '2026-11-09 01:07'
labels:
  - compiler
  - bug
  - size-S
dependencies: []
ordinal: 8800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) Noted in a task in Review and never filed: duplicate nested and top-level names lower to invalid IR; a fuzzer fixture exists (tests/fuzz).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the fuzzer fixture compiles and runs with the output of the oracle, or is refused with a Z diagnostic
- [x] #2 a regression program in tests/golden/run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).

Cause: not the duplicate names (the checker gives each declaration its own symbol). Reduced: a nested function declaration that captures a local declared below it (`function early() { return LIMIT; } const LIMIT = 100;` inside a function). The closure object is made at the declaration statement and copied LIMIT by value before it existed: the lowering read an undeclared variable (`const 0` of type void) and stored it into the f64 field, hence 'const of a non-scalar type' / 'setfield value type differs'.

Fix (src/ir/lower.cpp): Lowering::lateCells, the variables a function written above their declaration captures, live in a cell (isCell); declareClosureFns makes their cells at the start of the statement list (with the closure cells) and their declaration writes the cell (FnLower::preCelled). Each loop iteration still gets its own cell. Destructured declarations and a constructor body after super() are not pre-celled (unchanged behaviour).

Proof: tests/fuzz/regress/check-dup-names-invalid-ir.ts prints 104 1 104 1 on interpreter, --native and QuickJS (QuickJS = JavaScript); tests/golden/run/nested_shadow_hoist.ts (shadowed function, class, const; a let changed after the first call; a loop) same output on the three engines; tests/t0/fuzz_regress.sh now checks the fixture's output; tests/run --only run and --only fuzz_regress PASS.

Seen, for backlog/later.md: an arrow function that uses a const or let declared below it in the same block (`const show = () => LIMIT; const LIMIT = 1;`) is refused with Z0101; TypeScript accepts it (lambdas are checked where they are written, nested function bodies are deferred). The lowering half is already there (lateCells covers lambdas too).

Research (sonnet, 2026-11-09): strict-mode block functions are block-scoped and hoisted to their block (test262 block-decl-strict); resolve by symbol id, never by name; mangle lifted names (the IR already names them outer/inner); a hoisted nested function may run after a later let is initialised, so captures of later declarations must be by reference.

Proposed tests: tools/diff-matrix at the milestone (closures over the corpus on the three engines, ~10 min, <1 GB).
<!-- SECTION:NOTES:END -->
