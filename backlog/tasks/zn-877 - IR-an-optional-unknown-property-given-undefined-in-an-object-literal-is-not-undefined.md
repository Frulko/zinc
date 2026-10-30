---
id: ZN-877
title: >-
  IR: an optional unknown property given undefined in an object literal is not
  undefined
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 15:31'
labels:
  - language
  - size-S
milestone: m-28
dependencies: []
ordinal: 96
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by examples/discord (ZN-866): fetch(url, { method: 'GET', body: cond ? s : undefined }) throws 'Request with GET/HEAD method cannot have body.' on the interpreter and AOT. Smallest program: interface I { b?: unknown }; const o: I = { b: undefined }; o.b === undefined is false and typeof o.b is 'object' on --interp and --native, true and 'undefined' on QuickJS (and in TypeScript). const u: unknown = undefined and a missing property are right.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 o.b === undefined and typeof o.b === 'undefined' for { b: undefined } with b?: unknown, also through a ternary (c ? 'a' : undefined), on the interpreter, AOT and QuickJS
- [ ] #2 fetch(url, { method: 'GET', body: undefined }) sends a GET without a body
- [ ] #3 A T0 regression test
<!-- AC:END -->
