---
id: ZN-1009
title: >-
  QuickJS agrees with the interpreter: typed JSON.parse, i32 truncation,
  Map.get, TOUCH, host events
status: Backlog
assignee: []
created_date: '2026-11-07 16:34'
labels:
  - quickjs
  - size-M
milestone: m-13
dependencies: []
ordinal: 4900
updated_date: '2026-11-07 18:30'
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
- [ ] #1 one program runs on the interpreter, AOT and QuickJS with identical output for JSON.parse of a missing field, i32 division, Map.get of a missing key
- [ ] #2 examples/pinball runs a few frames on `--engine quickjs`
- [ ] #3 assets.onReload and a zinc:sys signal fire on QuickJS (a T0 test)
- [ ] #4 D179 checked copy: JSON.parse into an interface drops undeclared properties and throws TypeError on a wrong type on QuickJS too
<!-- AC:END -->
