---
id: ZN-383
title: >-
  Checker: contextual typing of generic arguments (object literals typed by the
  instantiated parameter)
status: Done
assignee: []
created_date: '2026-10-08 19:30'
updated_date: '2026-10-08 22:49'
labels:
  - compiler
  - checker
  - size-M
milestone: m-17
dependencies: []
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-367.03: in a generic call, object and array literal arguments are typed before the type arguments are inferred, so they take the shape of the literal: f<T>(p: { sections: { title?: string; data: T[] }[] }) called with [{ title: 'A', data }, { data }] fails ('{ title: string; data }' is not '{ title?: string | null; data }'), while the same call to a non-generic function works through the expected type. After inferring T, type such literals against the instantiated parameter (the record classes must match, arrays of records cannot be converted). Then SectionBase<T> of zinc:react-native can take title? and key? back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the call above compiles and runs (golden), with lambdas inside the literal checked once
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: object literals (and arrays of them) passed to a generic function are no longer typed by their own shape before inference: inferFromLiteral follows the parameter's shape (arrays, members by name) and unifies the leaves that can bind a type parameter; the call then types the literal once against the instantiated parameter (lambdas inside checked once, with the inferred types). A type parameter only a lambda of the literal can tell falls back to the literal's shape, as before. Golden tests/golden/run/generic_literal_args.ts (output from Node). FlatList / SectionList keyExtractor take (item, index) as in React Native. SectionBase<T> stays { title, data }: a declared const array of sections has the literal's own record, and arrays of records do not widen (ZN-389). Checks: T0 checker, run (TZ=UTC), diagnostics, ir; react_native_lists, rn-tester, nuxt_ui; tests/run --changed 43/43; proto-capture compare --all 42/42. usage: n/a
<!-- SECTION:NOTES:END -->
