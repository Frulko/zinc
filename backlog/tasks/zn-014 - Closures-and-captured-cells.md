---
id: ZN-014
title: Closures and captured cells
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 08:23'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: closure fixtures pass in the interpreter; captured variables share state correctly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 closure fixtures pass in the interpreter; captured variables share state correctly.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closures: arrow functions and function expressions (parser, contextual parameter and return types, return type inference), function types as first-class values, named functions used as values (thunk classes). A lambda lowers to a class (captured variables as fields, plus this) implementing its function type's interface with a call method, so no new ZBC op: calls through a function value are callvirt .call, the verifier checks them like any virtual call. A captured variable that is also reassigned lives in a shared cell (one-field class), so captured variables share state; captured but never reassigned ones are copied. Checker: capture analysis with transitive captures, this capture for arrows, reassigned flags, top-level variables stay globals. Tests: closures and closures2 run goldens match Node exactly (shared counters, composition, nested lambdas, this capture, mutated parameter, per-iteration locals in a while loop); IR, ZBC and parser goldens; error fixtures for lambdas; unsupported fixtures (nested named function using outer variables, loop variable that is modified and captured: Z0005); 34 adversarial lambda snippets: 0 violations vs the oracle; ASan, zig c++ and 2100 corrupted .zbc: 0 crashes. Limits: no devirtualisation of function-value calls yet, no generic lambdas, no method values, per-iteration bindings of a for-let variable that the loop modifies. Registry example for Z0005 is now a generator. usage: 1540685 in / 159793932 cached / 716812 out tokens, 352 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
