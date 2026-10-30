---
id: ZN-877
title: >-
  IR: an optional unknown property given undefined in an object literal is not
  undefined
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 15:31'
updated_date: '2026-10-30 16:00'
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
- [x] #1 o.b === undefined and typeof o.b === 'undefined' for { b: undefined } with b?: unknown, also through a ternary (c ? 'a' : undefined), on the interpreter, AOT and QuickJS
- [x] #2 fetch(url, { method: 'GET', body: undefined }) sends a GET without a body
- [x] #3 A T0 regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: `b?: unknown` is the union Dyn | null (undef). A Dyn stored into it was kept as is, so the Dyn undefined object sat in the slot where undefined is null: `=== undefined` became `=== null` (false) and typeof of the union said 'object' for any non-null value. Fix (src/frontend/check.cpp convertDyn, src/frontend/dyn.cpp): a Dyn going into an `unknown | undefined` slot is normalised (the literal undefined becomes null, any other Dyn goes through the prelude's __dynOpt, which maps DynUndef to null); the converter of a `T | undefined` union into Dyn gives __undef (not __null) for null; typeof of `unknown | undefined` uses the Dyn's own typeof. Test: tests/t0/optional_unknown_undef.sh (interp, --native, QuickJS; includes new Request(url, { method: 'GET', body: undefined })). Not done (pre-existing, for backlog/later.md): `{ b: null }` into `b?: unknown` stores null and reads back as undefined (the Dyn|null slot cannot tell null from undefined).
<!-- SECTION:NOTES:END -->
