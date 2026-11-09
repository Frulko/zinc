---
id: ZN-376
title: >-
  Compiler: a function name used as a value is the same object each time; IR
  error in laStart with a debug accessor
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 16:00'
updated_date: '2026-11-09 01:01'
labels:
  - compiler
  - bug
milestone: m-13
dependencies: []
ordinal: 8700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-365. (1) Each read of a top-level function as a value builds a new thunk object (IrOp::New of its fnref class), so `f === f` is false and `list.indexOf(f)` never finds it: ui.addStepper/removeStepper deduplicated nothing (worked around with one stored function value in ui.ts and animated.ts). JavaScript gives the same function object: keep one thunk instance per function (a global made on first use). (2) Adding `export function laDebug(): string { return 'gone ' + laGone.length + ... }` to lib/std/ui.ts (copy in the task notes) made the lowering emit 'field access on a non-ref' in laStart (bb0 inst 20) with and without the optimiser: a typed object alias (LayoutAnimationConfig | null global, read as `laCfg as LayoutAnimationConfig`) loses its ref type somewhere; reduce and fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a top-level function read twice as a value is === to itself, and indexOf finds it (regression program in tests/golden/run)
- [x] #2 the laDebug case compiles (reduced regression program)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).

(1) src/ir/lower.cpp makeThunkGetter: every thunk class (a top-level function or a static method used as a value) gets one global and a getter function `fnref <name>$get` (g = G; if g == null { g = new thunk; G = g }; return g); every read of the function as a value calls the getter instead of IrOp::New. Lazy rather than made at the top of @main, so a hot swap that adds a thunk finds its global empty and fills it; hot keys: getter `<thunk key>$get`, global `<thunk key>`. Closures (nested functions that capture) still make a fresh object per evaluation, as JavaScript does per enclosing call. The workarounds are gone: lib/std/ui.ts laStepper and lib/std/animated.ts stepper (one stored lambda) replaced by the plain functions laStep and step.

(2) The laDebug case does not reproduce on develop (the 2026-10-25 review said the same): laDebug (laGone.length, laFrom.length, laOld.length, laRunning, laStartAt, (laCfg as LayoutAnimationConfig).duration) added to lib/std/ui.ts compiled and tests/golden/layout-anim ran on the interpreter and --native; the reduced pattern (a Config | null global set by laStart through `as`, read by a second function) is the second half of tests/golden/run/function_identity.ts. Seen on the way, not this task: `'s' + x` with x a nullable object is refused with Z0107 (TypeScript accepts it).

Proof: function_identity.ts same output on interpreter, --native and --engine quickjs; tests/golden/layout-anim (classic) and tests/golden/animated match on the interpreter; tests/run --only run PASS.

Research (sonnet, 2026-11-09): QuickJS binds a top-level declaration once at init (fclosure only for nested ones); AssemblyScript keeps identity with table indices and loses it once an env object wraps them (https://github.com/AssemblyScript/assemblyscript/issues/798): cache only capture-free functions, keep fresh objects for closures; generic instances are separate functions (here a generic used as a value gets no thunk); a lazy slot must be a GC/RC root.

Proposed tests: tests/run --only animated (T1, zinc:ui/animated after the stepper change, ~5 s, <200 MB); tools/diff-matrix at the milestone (function values on the three engines).
<!-- SECTION:NOTES:END -->
