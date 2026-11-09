---
id: ZN-1077
title: >-
  Checker regression: examples/ipod-web fails zinc check with Z0103 'El |
  Failure' to 'Failure'
status: Done
assignee: []
created_date: '2026-11-09 08:34'
updated_date: '2026-11-09 08:48'
labels:
  - checker
  - bug
  - size-S
dependencies: []
ordinal: 991000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-1049 on 2026-11-09: `zinc check examples/ipod-web` (and examples/ipod, which imports examples/ipod-web/src/services/subsonic.ts) fails with Z0103 Type non assignable 'El | Failure' vers 'Failure' at a meaningless place in lib/std/web.ts that changes with the entry point. Every iPod app session of the tests fails. Likely one of the checker commits of 2026-11-09: beb619f27 (cloned lambdas in field initialisers, unTdz narrowing), 0d6e694d8 (a field assigned in both branches) or 498f78a79 (widened records). A standalone copy of subsonic.ts's signatures does not reproduce it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/ipod-web and examples/ipod pass zinc check on develop
- [x] #2 the smallest program that reproduces it is a T0 regression test, on the interpreter, AOT and QuickJS
- [x] #3 the error points at the real source line
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: 498f78a79 (D231 widened records / methods through any). A class seen as unknown/any now gets a DynFn for each public method, so its view pulls in the method types (here a Promise<El | Failure | null> of subsonic.ts, via the AwaitJob record). dynSym then called jsonSym on every printable type of the closure, unguarded: inspectable accepts a union of two classes, jsonable does not, and jsonFunction's union case keeps only the last non-null member, so the generated __js<t>(v) passed El | Failure where Failure was wanted. beb619f27 and 0d6e694d8 are innocent: the main tree's binary of 04:49 (before both) already failed.
Fix (src/frontend/check.cpp): jsonSym only for a jsonable type (the view's toJSON already says '{}' for the others, dynConverter's jsonOk). Position: generated source was merged with the use site's file but its own text offsets, so its errors landed at a random line of that file (web.ts 4:64). A table genAt maps every generated node (and every copy of one: newNode, wrapNode, cloneNode, the truthy and arity thunks) to the program node it was generated for; diag reports there. With the guard turned off by hand the error now points at web.ts:1297 (the File passed as unknown) and at 'new Box()' in the small program.
Proof: zinc check examples/ipod-web and examples/ipod pass; ipod-web starts headless and serves; tests/run --only dyn_union_view, checker, jsx_map_props pass; run goldens field_lambda_init, map_get_missing_any, narrow_global_shadowed, union_primitive_object, open_record_writes and checker ok/field_branches pass.
Search (sonnet): tsc reports on the use node and puts the declaration site in relatedInformation; synthesized nodes copy their original's range (setTextRange); rustc spans keep an expansion chain and walk to source_callsite. Same idea here: a generated node reports at its origin.
later.md: - ZN-1077: JSON.stringify of a value whose type holds a union of two classes (A | B) writes '{}' through any and is refused when typed; jsonFunction could dispatch with instanceof as inspect does.
Proposed tests: tests/run --only run (all run goldens incl. dyn_union_view, ~1 min); tests/run --only dyn_union_view (3 engines, ~10 s).
<!-- SECTION:NOTES:END -->
