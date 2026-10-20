---
id: ZN-008
title: Typed SSA IR and `--emit=ir`
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 22:08'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-007
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want a complete typed SSA IR with a stable text dump, so that every backend derives from one source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `fib` IR matches a golden; effects and exceptional edges are representable; verifier rejects malformed IR.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/ir/{ir.h,ir.cpp,lower.cpp}: typed SSA with block parameters (no phis), effect sets per instruction, Call may carry an unwind edge, Throw/Unreachable terminators; dump is stable (dense value ids); verifier checks terminators, types, operand counts, call/branch signatures, definitions once, dominance of every use. Lowering: Braun SSA construction + removal of trivial block parameters, top-level variables used by functions become globals, classes (fields, constructors with field initialisers, methods as functions with this first), arrays, strings/templates, short-circuit and ternary via block params. 'zinc --emit=ir file.ts'. Goldens: fib, mandelbrot, nbody in tests/golden/ir. Unit test ir_test: 1 valid IR with unwind+throw, 13 malformed variants each rejected with the expected message. Not covered yet (Z0005): closures (ZN-014), default parameters, null, spread. Shared builtin list moved to include/zn/builtins.h; IR opcodes are IrOp (ZBC keeps zn::Op). Parser: Template nodes now keep their quasis (needed by the IR). usage: 494868 in / 22888121 cached / 213760 out tokens, 146 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
