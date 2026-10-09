---
id: ZN-399
title: >-
  AOT frame loop parity: borrowed loop elements, folded constants, typed field
  stores
status: Backlog
assignee: []
created_date: '2026-10-09 07:22'
labels:
  - perf
  - aot
dependencies:
  - ZN-397
priority: high
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-397 follow-up. Script time per frame at 200k balls (headless, min of 5): Next AOT update loop 1.54 ms vs prototype 0.69 ms, draw loop 1.48 vs 1.17. Remaining costs seen in the generated C++: retain/release of each element of 'for (const x of arr)' (Machine::retain/release with the mem stats check), top-level const numbers re-read from m.globals and 1/60 divided each iteration (no constant folding), SetField loads o->cls->fieldRef[c] although the field type is static, two calls per host row (hostFast entry then zrt::gfx), null checks on every field access of the same object.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The update loop of the bouncing-ball bench is at or under the prototype's time (measured, same machine)
- [ ] #2 Interpreter and AOT frames stay identical on bouncing-ball, nuxt-ui, rn-showcase, navigation
- [ ] #3 A test per optimisation (refcount elision, constant folding) in tests/
<!-- AC:END -->
