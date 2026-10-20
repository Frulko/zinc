---
id: ZN-012
title: Classes and closed-world layouts
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-06 07:36'
labels:
  - size-L
milestone: m-2
dependencies: []
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want classes with fixed field offsets and devirtualised calls where one implementation exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 class fixtures pass; IR shows direct field access; open interfaces use a vtable.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frontend: parser handles abstract classes, extends, implements, interfaces (method signatures), super(...)/super.m(), static members, modifiers (public/private/protected/readonly/override) and parameter properties (desugared to fields + this.x = x, flagged synthetic). Checker: class hierarchy (single inheritance, nominal), structural interfaces, override checks, abstract rules, accessibility, readonly, statics, constructor rules (super first, protected/private constructors, read-before-assign), class used before its declaration; new codes Z0114-Z0118 with fixtures. IR: closed-world layout (inherited fields first so offsets are fixed), selectors and per-class vtables, devirtualisation by instantiated-class analysis (one implementation: direct call; several or interface receiver: callvirt), refcast (upcast no-op, downcast checked at run time in ZBC), statics as globals, constructors with initialiser order super, parameter properties, field inits. ZBC/VM: reference registers tracked by class with subtype checks and LCA joins in the verifier, ops New GetField SetField CallVirt Downcast EqR NeR, class/selector tables in the file format (v2), objects on the heap with null checks, memory released at exit (RC is ZN-018). Tests: 8 new run programs match Node exactly (inheritance, super, interfaces, statics, parameter properties, abstract, devirtualisation, 12 parameter properties); IR and ZBC goldens show direct field access (getfield .N) and callvirt only where several implementations exist (interfaces.ir); 16 verifier unit cases for objects in zbc_test and 7 class-table cases in ir_test; oracle diff 69+ files 0 violations; 28 adversarial class snippets found 5 violations (class used before declaration x3, protected constructor, read before assigned) now fixed and fixtured. ASan found a parser use-after-free in parameter-property desugaring (reference held across a vector growth): fixed. 2850 corrupted .zbc files under ASan: 0 crashes. Limits: interface properties, accessors, generics, instanceof, abstract class fields are Z0005; TDZ for let/const is not modelled in the VM (globals read as zero); node needs --experimental-transform-types for parameter properties. usage: 1296776 in / 85626534 cached / 510195 out tokens, 263 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
