---
id: ZN-005
title: Parser for the numeric and function subset
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:31'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-004
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want functions, `let/const`, numbers, calls, `if`, loops and `return` to parse, so that `fib.ts` compiles.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `fib.ts`, `mandelbrot.ts`, `nbody.ts` parse; syntax errors carry a Z-code and position.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/frontend/{ast,parser}.{h,cpp}: uniform Node tree (layout per kind in ast.h), Pratt expressions, statements, classes (fields, constructor, methods), types, ASI, '>' merging. 'zinc parse --check|--dump'. T0 parser: fib, mandelbrot, nbody parse with consistent spans and match golden dumps; 7 error fixtures check Z-code and line:col. Codes Z0001-Z0004, Z0006 are placeholders for the ZN-006 registry. Stops at first error. Unsupported (Z0006): arrows, object literals, modules, generics, modifiers, switch/try/throw, interfaces; later tasks add them. Whole corpus under ASan: 0 crashes (9 parse, 43 diagnose, mostly 'modules' and 'interfaces'). usage: 145839 in / 8906066 cached / 82027 out tokens, 89 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
