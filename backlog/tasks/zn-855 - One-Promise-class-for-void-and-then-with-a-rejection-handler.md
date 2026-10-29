---
id: ZN-855
title: 'One Promise class for void, and then() with a rejection handler'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-28 23:11'
updated_date: '2026-10-29 00:11'
labels:
  - size-L
  - frontend
milestone: m-9
dependencies: []
ordinal: 563460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-29: fill the two gaps left by ZN-852. Promise<void> is the prelude class PromiseV and a generic Promise<T> made with T = void is converted to it (settling one microtask later than JavaScript, the type __Void showing in messages); then(onFulfilled, onRejected) is refused (Z0104).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Promise<void> and Promise<T> are one class: generic code with T = void, a spelled-out Promise<void> and async functions returning nothing share it; no conversion helper, no __Void in what a user sees; the settle order of the engine_gaps program and a new ordering fixture matches Node on the interpreter, AOT and QuickJS
- [x] #2 p.then(onFulfilled, onRejected) with two arguments works as in JavaScript (the handler's result fulfils the new promise, an error in it rejects it), for Promise<T> and Promise<void>
- [x] #3 No regression: checker, run, rc, qjs, quickjs, aot, native_records, ipod_plugin, plugin_fallback, ui tests and the async goldens pass; ir/zbc goldens regenerated only for understood diffs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: one generic class Promise<T>. T = void instantiates it with the empty prelude class __Void (D174's rule, now the only Promise<void>); PromiseV, AwaitJobV's old twin, __newPromiseV, __thenFromV, __thenVV, __finallyV, the neverPromiseV and asPromiseV helpers and the desugar renames are gone. The value is a definite field value!: T (no T[] array): a Promise<void> holds null, so it is no bigger than PromiseV and every Promise<T> loses two allocations. Internal promises are new Promise<T>(null) (no executor, no closures). Kept for speed only: resolveVoid() (async functions returning nothing), __awaitV (await of a Promise<void> passes 0 to the continuation), __thenV/__catchV (callbacks returning nothing). TypeScript rules added in the checker: a trailing parameter of type void may be left out (null is passed: resolve() of withResolvers<void>()), null fits void, a function value with fewer parameters, or with extra void parameters, fits through a generated adapter (arityThunk: p.then(done), setTimeout(resolve, ms)), new C(...) takes its type arguments from the wanted type (return new Promise(resolve => ...)), and new Promise<void>(executor) is __promiseVoid(executor) whose resolve is a () => void. Messages say void, never __Void (spoken()). then(f, g): __then2/__then2V, one job like then.

Proof (2026-10-29): tests/golden/run/promise_void_order.ts (.out is Node 24's output) matches on interp, AOT (zinc build; added to tests/t1/aot.sh) and --engine quickjs; engine_gaps matches on the three. tests/run --only: checker, run, ir, zbc, irformat, modules, tdz, rc (t1), qjs, quickjs, aot (t0+t1), native_records, ipod_plugin, plugin_fallback, ui, run_compiled, async_storage, microphone_sim, webcam_sim, host, date_f32, late_frame, platform_files, hot_off, fast_refresh, plugin_fetch and the 25 T1 ui_* tests pass; no ir/zbc golden changed. Full T0: only the known unrelated failures (embed, i18n, native, rt, sim_*, yoga: unbuilt binaries; plugin_manifest; runner_cwd skip); mqtt failed once under load (cannot connect) and passes alone.

Measured (M1 Pro, load 13-15 from other trees, min..median of 7 interleaved runs, 1e6 iterations): await of an async function returning nothing: interpreter 461..471 -> 377..392 ms, AOT 187..190 -> 129..135 ms; await of an async function returning a number: interpreter 552..580 -> 392..402 ms, AOT 232..237 -> 138..149 ms; await new Promise<void>(resolve => resolve()): interpreter 391..399 -> 398..402 ms (same), AOT 150..154 -> 146..150 ms.
<!-- SECTION:NOTES:END -->
