---
id: ZN-062
title: >-
  Parser pack: as const, satisfies, static blocks, accessor, const enum,
  declare, private methods, keyof, type predicates, async arrows, import.meta,
  inline type specifiers
status: Done
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-06 23:59'
labels:
  - language
  - parser
  - size-M
milestone: m-13
dependencies:
  - ZN-061
ordinal: 40040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One small construct at a time in src/frontend/parser.cpp (+ checker where it needs meaning), each with its own fixture in tests/golden: `as const`; `satisfies`; `static { }` blocks; `accessor` fields; `export const enum` and `const enum` (inlined at use); `declare` statements (ignored); `#private` methods and accessors; `keyof T`; `x is T` return types (checked as boolean); async arrow functions (desugared like async functions); `import.meta` (url/dirname of the module); `import { a, type B }` and `export { type B }`; a parenthesized function type as an arrow return type (`): (() => string) =>`); numeric separators and other lexical forms the prototype accepts. Where TypeScript erases the construct, erase it; where it has runtime meaning, implement the meaning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 one fixture per construct compiles and prints the Node result (tests/golden/run/syntax_*.ts)
- [x] #2 examples/pocket-hero, esp32-2432s022, mapper, 3d/cubes, 3d/model, three/* pass the parser step
- [x] #3 no regression in parser.sh and checker.sh; T1 passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Parser: as const, satisfies, static blocks, accessor, const enum, declare, #private methods, keyof, x is T, async arrows (desugar), import.meta.url/dirname/filename, inline type specifiers, (() => T) return types. Also fixed C.n = v on static fields (setter check treated the class as a value) and the kindName table misaligned by NonNull in ZN-061. Not done: type predicate narrowing (parsed as boolean), keyof is plain string.
<!-- SECTION:NOTES:END -->
