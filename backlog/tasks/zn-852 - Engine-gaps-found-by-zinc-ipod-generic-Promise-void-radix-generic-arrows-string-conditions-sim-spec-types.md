---
id: ZN-852
title: >-
  Engine gaps found by zinc:ipod: generic Promise<void>, radix, generic arrows,
  string conditions, sim spec types
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-28 22:38'
updated_date: '2026-10-28 23:04'
labels:
  - size-L
  - frontend
milestone: m-9
dependencies: []
ordinal: 561460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while writing plugins/ipod/native/ipod.sim.ts (owner 2026-10-28: fill the engine's gaps, never work around them). Each one is reproduced in a small program and fixed on the interpreter, AOT and QuickJS, then the sim is written plainly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Promise<T> made by generic code with T = void is a Promise<void> (fail<void>(), Promise.reject<void>, resolve<void>): await, then, catch on the three engines; the PromiseV diagnostic and the failV helper of the iPod sim are gone
- [x] #2 Number.prototype.toString(radix) for 2 to 36, as in JavaScript
- [x] #3 Generic arrow functions (const id = <T>(v: T): T => v)
- [x] #4 A string, a number or a nullable value as a condition (if, ?:, &&, ||, !) follows JavaScript truthiness, unless a recorded decision refuses it
- [x] #5 An empty array literal inside an object literal takes its type from the expected type through a generic call (Promise.resolve<C>({ xs: [] }) where Promise<C> is expected)
- [x] #6 A stand-in (x.sim.ts) can import type from its own spec instead of copying the records; the iPod and gphoto2 sims do
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-29). Proof: tests/golden/run/engine_gaps.ts matches Node's output on the interpreter, AOT (zinc run --native) and QuickJS; tests run: checker, run, rc, tdz, parser, lexer, modules, qjs, qjs_native, quickjs, aot, plugin_fallback (new stand-in records case), module_resolution, native_records, ipod_plugin: all pass; ZINC_NATIVE=sim zinc check tests/data/ipod-app ok and the app runs on the sim (interp, AOT).
- #1 Promise<void>: a generic class made with T = void holds the prelude class __Void in its place (instantiateClass), so Promise<T> of fail<void>() is Promise<__Void> and lowers; where a Promise<void> (PromiseV) is wanted, and for .catch/.finally, it is converted by a generated helper (a PromiseV that settles one microtask after it). The stop-gap diagnostic is gone. Chosen over unifying Promise/PromiseV (the prelude's bodies and await paths all assume PromiseV carries no value).
- #2 n.toString(radix): generated helper, V8's DoubleToRadixCString (digits equal to Node's). Radix outside 2..36 is not a RangeError (ponytail comment).
- #3 const f = <T>(...) => ... is parsed as a generic function declaration of that name.
- #4 No recorded decision refused it (only the old fixture errors/condition_not_bool.ts from the first checker): strings and numbers in if/while/?:/!/&& || under a condition use JS truthiness; the fixture moved to checker/ok/condition_truthy.ts.
- #5 A generic call takes its type arguments from the wanted type before typing an object-literal argument (Promise.resolve({ xs: [] }) to Promise<C>, Picture with i32 fields).
- #6 Inside x.sim.ts './x.spec' loads the spec's declarations without requireNative; the loader appends to a sim 'export type { records } from ./x.spec' for spec records it does not declare.
<!-- SECTION:NOTES:END -->
