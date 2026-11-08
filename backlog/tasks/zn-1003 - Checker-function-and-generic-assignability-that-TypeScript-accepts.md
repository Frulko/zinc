---
id: ZN-1003
title: 'Checker: function and generic assignability that TypeScript accepts'
status: Backlog
assignee: []
created_date: '2026-11-07 16:33'
labels:
  - checker
  - language
  - size-M
milestone: m-13
dependencies: []
ordinal: 2500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Six valid TypeScript spellings are refused: a function with a default parameter where `() => void` is expected (Z0103), `list.find(...)?.[1]` on a tuple (Z0107), `resolve(undefined)` on `Promise<void>` (Z0104), `(e: any) => ...` where `(Error) => ...` is expected (`.catch`, `onError`), `Map<string, Class>` where `Map<string, Interface>` is expected, `.catch` with a void arrow body (Z0110). Fix each in the checker with a regression test on interpreter, AOT and QuickJS (engine gaps are fixed, not worked around).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- A function with a default parameter refused where `() => void` is expected (`onLayerChange(noteChange)`, Z0103), and `list.find(...)?.[1]` on a tuple (Z0107): valid TypeScript, both written another way in examples/video/mapper for now; found by the mapper's history and framing.
- ZN-855: `resolve(undefined)` on a `new Promise<void>` is refused (its resolve is `() => void`) though TypeScript accepts it; let the call drop an extra null or undefined argument.
- ZN-867: the checker refuses `.catch((e: any) => ...)` (a function with an `any` parameter is not assignable to `(Error) => any`), which TypeScript accepts.
- ZN-889: the checker refuses `(error: any) => void` where `(Error) => void` is expected; TypeScript accepts it (engine gap).
- ZN-891: Zinc refuses Map<string, Class> where Map<string, Interface> is expected (Z0103), which TypeScript accepts; fix the checker's generic variance with a test, then CallQuality can take an interface.
- ZN-995: `Promise.catch` with a void arrow body is refused (Z0110 "not all paths return a value") while TypeScript accepts it; reproduce and fix in the checker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each of the six cases checks, compiles and prints the same on the interpreter, AOT and QuickJS (one tests/t0 or t1 case with six small programs)
- [ ] #2 a default-parameter function passes where fewer parameters are expected, an `any` parameter accepts an `Error`, a Map of a class is a Map of its interface for reads
- [ ] #3 no existing checker golden changes except the intended ones
- [ ] #4 examples/video/mapper drops the workaround for the first two spellings
<!-- AC:END -->
