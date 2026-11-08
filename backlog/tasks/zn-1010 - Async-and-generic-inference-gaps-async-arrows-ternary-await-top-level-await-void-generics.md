---
id: ZN-1010
title: >-
  Async and generic inference gaps: async arrows, ternary await, top-level
  await, void generics
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
labels:
  - checker
  - async
  - size-M
milestone: m-13
dependencies: []
ordinal: 3400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One group of Z0005/Z0103/Z0109 refusals on code TypeScript infers: an async arrow or object-literal method without a `Promise<T>` annotation (photo-sorter, trieur, mapper met it), `await` in a ternary branch, destructuring in a `for...of` whose body awaits, `.then(async () => ...)`, a generic whose T is inferred as void (`untrack(() => ...)`), the return type of a generic call from its arguments, top-level await in a script or test, `finally` skipped after `return await`, and the Promise constructor not rejecting when its executor throws. Reproduce in the smallest programs, fix in desugar.cpp/check.cpp, test on the three engines. (`.then` flattening stays with ZN-794.)

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- D178: `?:` with `await` in one branch and `null` in the other, or an await inside a larger expression of a branch, is still Z0005; it needs the branch types in the desugar, and the plain branch's extra microtask should go too.
- D178: in an async `Promise<void>` function, `return voidPromise()` resolves at once instead of waiting for that promise (`src/frontend/desugar.cpp` `fix()`, the `vp` path).
- ZN-852: a generic Promise<void> converted to PromiseV settles one microtask later than Node; and `await fail<void>()` used as a value has the type `__Void`, which can show in messages. Merging Promise and PromiseV would remove both.
- ZN-855: the Promise constructor does not reject when its executor throws, as JavaScript does.
- ZN-844: `finally` is skipped after `return await` in an async function (interpreter and native): a cleanup in a `finally` never runs; found in app/web-relay, reproduced in 5 lines.
- Checker: Z0005 for an await in a nested ternary branch (`c ? await a() : d ? await a() : []`); Z0103 for `.then` returning a Promise (no flattening to Promise<T>).
- `.then` callbacks returning `T | Promise<T>`, or then(f, g) with only one returning a promise, are not flattened; the adoption takes one microtask where Node takes two.
- Checker: `.then(async () => ...)` on a `Promise<void>` gives Z0103 (the async callback's Promise is not flattened).
- Checker: destructuring in a `for (const [k, v] of ...)` whose body awaits gives Z0005.
- Checker: Z0005 "async function without a Promise<T> return type" for async arrow functions and object-literal methods without an annotation (photo-sorter and trieur stop on it, now that their circular-import error is gone).
- ZN-878: top-level await is refused (Z0005); scripts and tests have to wrap their code in an async main.
- ZN-881: infer a generic function's return type from its arguments (Z0109 today asks for it written out).
- mapper: the frontend refuses an `async` arrow with no `Promise<T>` return type (Z0005); TypeScript infers it, and a callback written the plain way hits it.
- ZN-993: `const r = fn()` is refused (Z0109) when a generic T is inferred as void, e.g. `untrack(() => {...})`; any generic helper written that way breaks for void callbacks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `const f = async () => 1` and an unannotated async object-literal method check and run (inferred Promise<i32>)
- [ ] #2 `c ? await a() : d ? await a() : []` and `for (const [k, v] of xs) { await ... }` run on the three engines
- [ ] #3 `const r = untrack(() => {...})` and `const x = id(args)` infer T without Z0109
- [ ] #4 top-level await works in an entry file of a script or test (or states the supported spelling) and `finally` runs after `return await`
- [ ] #5 a throwing Promise executor rejects the promise
- [ ] #6 a test per case in tests/run, one engine for the long proof and two for a smoke run
<!-- AC:END -->
