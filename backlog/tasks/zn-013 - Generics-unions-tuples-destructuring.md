---
id: ZN-013
title: 'Generics, unions, tuples, destructuring'
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 08:08'
labels:
  - size-L
milestone: m-2
dependencies: []
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: the corresponding sections of `examples/lang` pass; every program we accept is accepted by the oracle (`next/tools/oracle`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the corresponding sections of `examples/lang` pass; every program we accept is accepted by the oracle (`next/tools/oracle`).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Generics: functions, classes, interfaces, type aliases; constraints, explicit and inferred type arguments; templates checked once over opaque Param types, instances made by cloning nodes (Ast::nodes is a deque) and lowered as Box<i32>, identity<f64>. Tuples: anonymous classes, literals typed by expected tuple, constant indexing. Destructuring: array, tuple and object patterns in declarations, parameters, for-of and assignments ([a, b] = [b, a]). Unions: T | null and unions of classes with flow narrowing (=== null, instanceof, !, &&, ||, ternary, early exit, loops, assignment, initialiser); only references and null lower. ZBC LoadNull/InstanceOf. Tests: run goldens generics, tuples, unions match Node exactly; 150+ adversarial snippets against the oracle found 0 violations after fixing: class used before declaration, protected constructor, read before assigned, and a test program clashing with lib.dom Node; oracle diff 106 files 0 violations; ASan, zig c++, 1800 corrupted .zbc: 0 crashes. Limits (Z0005): generic methods, default type args, unions of numbers/strings/booleans (no boxing), property narrowing, switch/typeof narrowing, destructuring defaults and tuple rest. The lang section proof (Stack<string>, first<T>) waits for arrays and strings in ZBC (ZN-015, ZN-017). usage: 1472023 in / 136989694 cached / 657830 out tokens, 327 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
