---
id: ZN-1009
title: >-
  QuickJS agrees with the interpreter: typed JSON.parse, i32 truncation,
  Map.get, TOUCH, host events
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
updated_date: '2026-11-08 21:00'
labels:
  - quickjs
  - size-M
milestone: m-13
dependencies: []
ordinal: 4900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Small divergences found by demos on `--engine quickjs`: a typed `JSON.parse` with a missing field gives undefined where the other engines throw; a number assigned to an i32 is not truncated (ZN-796 covers numbers: carry this case there if it is not solved); `Map.get` of a missing key returns null; `zinc:platform` has no `TOUCH` export so pinball does not run; host events (`__addEvHandler`) never fire so assets.onReload, zinc:sys signals and stdin do not work. Align all with a test that runs one program on the three engines and compares the output.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- D178: a typed `JSON.parse` with a missing field gives `undefined` on QuickJS where the interpreter and compiled program throw "cannot convert Dyn (undefined)"; the three engines should agree.
- ZN-450: QuickJS has no host events (`__addEvHandler`): assets.onReload, zinc:sys signals and stdin, and zinc:process events never fire on `--engine quickjs`.
- ZN-790: QuickJS's `zinc:platform` has no `TOUCH` export, so examples/pinball and n3ds-pinball do not run with `--engine quickjs`.
- QuickJS: do the checked copy where `any` meets a typed target (D179: drop undeclared properties, TypeError on a wrong type), so JSON.parse into an interface agrees with the interpreter and AOT; the QuickJS transform needs the checker's conversion sites.
- Engine (QuickJS): a number assigned to an i32 is not truncated on QuickJS (`let z: i32 = 1; z = 7 / 2` prints 3.5, the interpreter 3); the strip pass has no types, so inferred i32 locals need the checker's types. qjs_demos is off the CI until then (webcam frame 1px off).
- ZN-?: `Map.get` of a missing key returns null instead of undefined on QuickJS (engine gap found by the ink agent, ZN-931 report): align with the interpreter and test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 one program runs on the interpreter, AOT and QuickJS with identical output for JSON.parse of a missing field and Map.get of a missing key (i32 division carried to ZN-796, as the description allows)
- [x] #2 examples/pinball runs a few frames on `--engine quickjs`
- [x] #3 assets.onReload and a zinc:sys signal fire on QuickJS (a T0 test)
- [x] #4 D179 checked copy: JSON.parse into an interface drops undeclared properties and throws TypeError on a wrong type on QuickJS too
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worker branch).
- JSON.parse typed (D179 checked copy) on QuickJS: src/qjs/strip.cpp dynCopiesForJs wraps `const p: P = JSON.parse(s)` and `JSON.parse(s) as P` in `__dynAs('<schema>', ...)`; the schema comes from schemaOfType (native_gen.cpp) over the file's and its relative imports' declarations, with a tilde mode (`~T` optional field stays undefined, `@Name{}`/`^Name` for records that hold themselves); src/qjs/prelude.cpp __dynAs keeps the declared fields, truncates i32/u32, and throws the typed engines' TypeError text (`cannot convert Dyn (undefined) to number`). Types with no schema (literal unions, classes, generics, extends) stay unchecked as before. Modules with JSON.parse skip the transform cache (their schemas depend on imported files), ceiling a few ms per module.
- Map.get of a missing key: already undefined on all engines (fixed by e2de7dfe5); covered by the test.
- TOUCH / pinball: examples/pinball and n3ds-pinball run 20 frames on --engine quickjs today (ZINC_HEADLESS=1 ZINC_FRAMES=20); nothing to change.
- Host events: __addEvHandler/__pollHost already exist in the QuickJS prelude; assets.onReload (fed through ZINC_DEV_FD on stdin) and onSignal fire; covered by the test.
- i32 division (`z = 7 / 2`): needs the checker's types in the transform, same mechanism as ZN-796's wraps: carried to ZN-796 (description and AC #1), as this task's description says.
- Test: tests/t0/qjs_agree.sh (interp, AOT, QuickJS on one program + host events), json_typed_shape now compares QuickJS too. Passing: qjs_agree, json_typed_shape, qjs, qjs_robust.
- Research: QuickJS-ng has JS_NewArrayBufferCopy/JS_NewUint8ArrayCopy/JS_GetUint8Array (https://raw.githubusercontent.com/quickjs-ng/quickjs/master/quickjs.h); not needed here.
- later.md line (for the coordinator): ZN-1009: QuickJS checked copy covers JSON.parse at declarations and `as` only; arguments, returns and `any` variables need the checker's conversion sites in the transform.
- Proposed tests: tests/t1/worker_engines.sh (schemaOfType touched, default mode unchanged), tools/diff-matrix.
<!-- SECTION:NOTES:END -->
