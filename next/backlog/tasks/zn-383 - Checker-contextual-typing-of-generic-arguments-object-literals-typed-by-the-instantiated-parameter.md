---
id: ZN-383
title: >-
  Checker: contextual typing of generic arguments (object literals typed by the
  instantiated parameter)
status: Backlog
assignee: []
created_date: '2026-10-08 19:30'
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
- [ ] #1 the call above compiles and runs (golden), with lambdas inside the literal checked once
<!-- AC:END -->
