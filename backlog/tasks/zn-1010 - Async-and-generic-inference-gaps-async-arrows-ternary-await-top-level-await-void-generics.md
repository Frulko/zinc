---
id: ZN-1010
title: >-
  Async and generic inference gaps: async arrows, ternary await, top-level
  await, void generics
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
updated_date: '2026-11-08 20:08'
labels:
  - checker
  - async
  - size-M
milestone: m-13
dependencies: []
ordinal: 3400
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
- [x] #1 `const f = async () => 1` and an unannotated async object-literal method check and run (inferred Promise<i32>)
- [x] #2 `c ? await a() : d ? await a() : []` and `for (const [k, v] of xs) { await ... }` run on the three engines
- [x] #3 `const r = untrack(() => {...})` and `const x = id(args)` infer T without Z0109
- [x] #4 top-level await works in an entry file of a script or test (or states the supported spelling) and `finally` runs after `return await`
- [x] #5 a throwing Promise executor rejects the promise
- [x] #6 a test per case in tests/run, one engine for the long proof and two for a smoke run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worker branch). Test: tests/t0/async_infer.sh (tests/data/async_infer, expected.out = Node 24's output; tsc oracle accepts the file) passes on the interpreter, AOT and QuickJS; checker, async_gaps, promise_adopt, dyn_generic, ts_assignability pass; atelier, inspector, hero, zed-editor, nuxt-ui, rn-showcase check clean.

Research (TypeScript handbook, type inference https://www.typescriptlang.org/docs/handbook/type-inference.html; ECMA-262 27.2.3.1 Promise(executor) https://tc39.es/ecma262/#sec-promise-executor; tsconfig module https://www.typescriptlang.org/tsconfig/#module): an unannotated async function returns Promise<awaited union of its returns> (a returned Promise<X> is not nested); `untrack(() => {})` binds T = void; top-level await needs a module (export {} or an import); an executor that throws rejects unless already resolved.

How:
- Unannotated async function expressions (arrows, object-literal methods): desugar.cpp gives them `Promise<__AsyncTn>` and keeps in Ast::asyncShape a copy of the body taken before the rewrite, with `await e` read as `e.value`. check.cpp inferAsync: T is the promise the context expects (a callback typed `() => Promise<X>`), else the copy is checked as a plain lambda (its diagnostics dropped) and T is its return type (a returned Promise<X> gives X). Falling off the end settles with resolveVoid.
- `for (const [k, v] of xs)` around await: the loop variable's declarator (name or pattern) is declared from `arr[i]`.
- Generic T = void: `const r = f()` of type void is accepted for a const (the IR stores nothing and reads it as a dropped 0); a let still asks for a type.
- Generic function without a return type (`function id<T>(x: T) { return x; }`): each instance checks its body when instantiated, in inference mode, and takes the inferred return type.
- Top-level await: the module's statements from the first one that awaits run in `(async (): Promise<void> => {...})()`; declarations (functions, classes, types, imports, exports) stay at module level; an exported variable after the await is refused with a message. Its variables are locals of that function: a function declared above cannot use them.
- `return p` in an async Promise<void> function adopts p (was resolved at once, D178 line); any other value is evaluated and dropped.
- The Promise constructor (and new Promise<void>) catches an executor's throw and rejects.
- `finally` after `return await` already ran (ZN-844 shape `try { return await p } finally {}` prints in Node's order on all engines, in the test).
- Fixture tests/golden/checker/errors/async_arrow.ts moved to ok/; errors/async_declaration.ts keeps the refusal of an unannotated async function declaration.

Left (for backlog/later.md):
- Unannotated async function declarations and class methods still need Promise<T> (Z0005): the signature is needed before bodies are checked; use the pending-inference path (resolvePending) with the asyncShape copy.
- `c ? await a() : b` still costs the plain branch one microtask (order differs from Node when two async functions interleave); `c ? await a() : null` is still Z0005 (needs branch types in the desugar).
- `.then` callbacks returning T | Promise<T> not flattened (ZN-794 lines), the Promise/PromiseV merge (ZN-852) not done.
<!-- SECTION:NOTES:END -->
