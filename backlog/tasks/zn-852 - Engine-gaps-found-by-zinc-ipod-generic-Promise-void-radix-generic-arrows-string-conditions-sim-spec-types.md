---
id: ZN-852
title: >-
  Engine gaps found by zinc:ipod: generic Promise<void>, radix, generic arrows,
  string conditions, sim spec types
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-28 22:38'
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
- [ ] #1 A Promise<T> made by generic code with T = void is a Promise<void> (fail<void>(), Promise.reject<void>, resolve<void>): await, then, catch on the three engines; the PromiseV diagnostic and the failV helper of the iPod sim are gone
- [ ] #2 Number.prototype.toString(radix) for 2 to 36, as in JavaScript
- [ ] #3 Generic arrow functions (const id = <T>(v: T): T => v)
- [ ] #4 A string, a number or a nullable value as a condition (if, ?:, &&, ||, !) follows JavaScript truthiness, unless a recorded decision refuses it
- [ ] #5 An empty array literal inside an object literal takes its type from the expected type through a generic call (Promise.resolve<C>({ xs: [] }) where Promise<C> is expected)
- [ ] #6 A stand-in (x.sim.ts) can import type from its own spec instead of copying the records; the iPod and gphoto2 sims do
<!-- AC:END -->
