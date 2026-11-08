---
id: ZN-794
title: Promise.then flattens a returned promise
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:54'
updated_date: '2026-11-08 19:04'
labels:
  - size-S
milestone: m-13
dependencies: []
ordinal: 2900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-155: `p.then(x => promise)` does not flatten the promise it returns, so `fetch(u).then(r => r.text())` yields a Promise (async/await is right): the checker's __then helpers need a Promise-returning variant. The parity gate's most visible PARTIAL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `fetch(u).then(r => r.text())` has type Promise<string> and yields the text on interpreter, AOT and QuickJS
- [x] #2 a T0 test covers then, catch and finally returning a promise
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch). Found: then already flattened (__thenP, ZN-155 line was stale for then: fetch(u).then(r => r.text()) is Promise<string>); catch refused a callback returning a promise (Z0103) and finally ignored the returned promise. Fix: prelude __catchP (adopts) and __finallyP (waits for the callback's promise, then keeps the original outcome, or its rejection: spec Promise.prototype.finally, thenFinally/catchFinally https://tc39.es/ecma262/#sec-promise.prototype.finally; resolution procedure https://tc39.es/ecma262/#sec-promise-resolve-functions). The checker picks them when the callback is a function name or a function expression whose returned values all have a type of their own (call, new, name, member, await) or whose result is annotated: it is typed with an open result first; a literal return keeps taking its type from the promise as before (e.g. Promise<i32>.catch(e => 0)). Order matches Node 24 on the probe (11 lines). Test: tests/t0/promise_adopt.sh + tests/golden/host/promise_adopt.ts/.out (interpreter, --native, --engine quickjs; fetch against serve(0) in-process). Proof: promise_adopt, async_gaps, checker PASS. Limits, for backlog/later.md: a catch callback mixing a literal and a promise return still refuses (TypeScript gives Promise<T | U>); exact microtask tick counts of then-adoption are not the spec's 2 extra ticks (ThenJobP adopts in 1).
<!-- SECTION:NOTES:END -->
