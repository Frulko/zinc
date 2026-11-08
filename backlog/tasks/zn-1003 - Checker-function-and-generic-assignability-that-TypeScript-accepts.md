---
id: ZN-1003
title: 'Checker: function and generic assignability that TypeScript accepts'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:33'
updated_date: '2026-11-08 19:44'
labels:
  - checker
  - language
  - size-M
milestone: m-13
dependencies: []
ordinal: 2500
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
- [x] #1 each of the six cases checks, compiles and prints the same on the interpreter, AOT and QuickJS (one tests/t0 or t1 case with six small programs)
- [x] #2 a default-parameter function passes where fewer parameters are expected, an `any` parameter accepts an `Error`, a Map of a class is a Map of its interface for reads
- [x] #3 no existing checker golden changes except the intended ones
- [x] #4 examples/video/mapper drops the workaround for the first two spellings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done on develop (worker branch). Research (TypeScript checker.ts compareSignaturesRelated: optional parameters and a void result are not compared, a parameter of type any relates both ways, getMinArgumentCount makes a trailing void parameter optional, getVariances measures Map's V covariant through method bivariance; https://www.typescriptlang.org/docs/handbook/type-compatibility.html, https://github.com/microsoft/TypeScript/blob/main/src/compiler/checker.ts).

What changed (src/frontend/check.cpp unless said):
- arityThunk: extra parameters that are optional or defaulted are accepted, and a result is dropped where void is expected. A function declaration named as the argument becomes an arrow that calls it by name, so its defaults are evaluated (a call through a function value passes null for what it leaves out).
- thunkable: a parameter that takes more (any/unknown, or a base class of the expected one) gets a thunk; an any parameter is boxed by its Dyn converter in the generated code.
- a call drops trailing undefined literals past the parameters of a void function: resolve(undefined) of a Promise<void> (its resolve is () => void here).
- parser.cpp sets the optional flag on a?.[i]; the checker types it as a?.b (receiver without null, result | undefined); ir/lower.cpp lowers it through optionalAccess with the element's own type.
- Map and Set are covariant in their values as arrays are: a copy of the collection with the values converted (writes to the copy are not seen by the original; TypeScript shares it).
- catch of a Promise<T> whose callback returns nothing: a generated helper over __then2 gives a Promise<T | undefined> (prints undefined after, as Node). Promise.reject(e).catch(f): __catchN / __catchNV in the prelude (modules.cpp). lib/zinc.d.ts gets the matching catch overload.
- examples/video/mapper: onLayerChange(noteChange) and WORDS as [string, string][] with find(...)?.[1].

Proof: tests/t0/ts_assignability.sh (tests/golden/assign/ts_assignability.ts, six cases, Node's output, tsc accepts it) PASS on interpreter, AOT and QuickJS; checker, promise_adopt, array_covariance, nested_default(s), optional_unknown_undef PASS; zinc check examples/video/mapper OK.

Known limit (pre-existing gap, not this task's six cases): a function value with default parameters (not a named declaration), called with fewer arguments, gets null for them (const g = note; g() traps): defaults are evaluated at direct call sites only.

Proposed tests: tests/t1/mapper.sh (history labels after the WORDS change); tools/diff-matrix at the milestone.
<!-- SECTION:NOTES:END -->
