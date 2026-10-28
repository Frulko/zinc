---
id: ZN-855
title: 'One Promise class for void, and then() with a rejection handler'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-28 23:11'
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
- [ ] #1 Promise<void> and Promise<T> are one class: generic code with T = void, a spelled-out Promise<void> and async functions returning nothing share it; no conversion helper, no __Void in what a user sees; the settle order of the engine_gaps program and a new ordering fixture matches Node on the interpreter, AOT and QuickJS
- [ ] #2 p.then(onFulfilled, onRejected) with two arguments works as in JavaScript (the handler's result fulfils the new promise, an error in it rejects it), for Promise<T> and Promise<void>
- [ ] #3 No regression: checker, run, rc, qjs, quickjs, aot, native_records, ipod_plugin, plugin_fallback, ui tests and the async goldens pass; ir/zbc goldens regenerated only for understood diffs
<!-- AC:END -->
