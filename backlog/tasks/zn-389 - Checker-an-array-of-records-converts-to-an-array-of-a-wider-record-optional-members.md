---
id: ZN-389
title: >-
  Checker: an array of records converts to an array of a wider record (optional
  members)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-08 22:45'
updated_date: '2026-11-08 22:38'
labels:
  - compiler
  - checker
  - size-M
dependencies: []
ordinal: 6600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-383: `const DATA = [{ title: 'A', data }]` is typed by the literal's own record; passing DATA where { title?: string; key?: string; data: T[] }[] is expected fails ('arrays of records cannot be converted'), so zinc:react-native's SectionBase<T> stays exactly { title, data }. TypeScript accepts it structurally. Either type such a const by its first use (contextual), or convert the array (copy each element into the wider record, members missing as undefined) at the call. Then SectionBase<T> takes title? and key? back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/rn-tester and the react-native lists golden compile with SectionBase<T> = { title?, key?, data }
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).

The checker already converts an array of records to an array of a wider record (check.cpp, the arrwiden helper: a new array, each element copied with the fields asked for, the missing ones undefined; it landed with the covariant arrays work), so the only change left was SectionBase<T> = { title?: string; key?: string; data: T[] } in lib/std/react-native.tsx. Decision: keep the copy at the call (not contextual typing of the const by its first use): it already exists, works for any number of uses, and SectionList only reads its sections. Its known limit: writes to the converted array are not seen by the original (TypeScript shares it); fine for props.

Proof: zinc check examples/rn-tester (declares FOOD first) and tests/golden/react-native-lists clean; the lists golden program run once headless (--interp, 40 frames) prints its golden lines; a scratch SectionList with declared-first sections, a key-only section and title ?? fallback renders on interpreter, default engine and QuickJS. Regression case appended to tests/golden/run/generic_record_infer.ts (declared-first sections into { title?, key?, data }), same output on the three engines.

Web search (sonnet): Dart's covariant List with checked writes (https://dart.googlesource.com/sdk.git/+/refs/tags/2.8.4/docs/language/informal/covariant-from-class.md), AssemblyScript contextual typing of literals (https://www.assemblyscript.org/status.html), ArkTS refuses structural typing. Copy vs contextual typing weighed above.

Proposed tests: tests/run --only run (the run goldens incl. generic_record_infer, ~1 min, <300 MB); tests/run --only react_native_lists and rn_tester at the milestone (T1).
<!-- SECTION:NOTES:END -->
