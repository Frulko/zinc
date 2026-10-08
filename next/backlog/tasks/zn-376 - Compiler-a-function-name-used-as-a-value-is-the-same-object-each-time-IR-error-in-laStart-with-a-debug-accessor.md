---
id: ZN-376
title: >-
  Compiler: a function name used as a value is the same object each time; IR
  error in laStart with a debug accessor
status: Backlog
assignee: []
created_date: '2026-10-08 16:00'
labels:
  - compiler
  - bug
milestone: m-13
dependencies: []
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-365. (1) Each read of a top-level function as a value builds a new thunk object (IrOp::New of its fnref class), so `f === f` is false and `list.indexOf(f)` never finds it: ui.addStepper/removeStepper deduplicated nothing (worked around with one stored function value in ui.ts and animated.ts). JavaScript gives the same function object: keep one thunk instance per function (a global made on first use). (2) Adding `export function laDebug(): string { return 'gone ' + laGone.length + ... }` to lib/std/ui.ts (copy in the task notes) made the lowering emit 'field access on a non-ref' in laStart (bb0 inst 20) with and without the optimiser: a typed object alias (LayoutAnimationConfig | null global, read as `laCfg as LayoutAnimationConfig`) loses its ref type somewhere; reduce and fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a top-level function read twice as a value is === to itself, and indexOf finds it (regression program in tests/golden/run)
- [ ] #2 the laDebug case compiles (reduced regression program)
<!-- AC:END -->
