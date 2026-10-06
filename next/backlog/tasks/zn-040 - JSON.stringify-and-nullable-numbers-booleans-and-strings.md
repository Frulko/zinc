---
id: ZN-040
title: 'JSON.stringify and nullable numbers, booleans and strings'
status: Done
assignee: []
created_date: '2026-10-06 11:40'
updated_date: '2026-10-06 12:05'
labels:
  - size-L
milestone: m-3
dependencies: []
ordinal: 21150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Needed by literal_member_arrays: JSON.stringify of records, arrays and tuples through generated serializers, and (boolean | null)[] style types. Nullable primitives need a representation (boxed or tagged); string | null and number | null currently crash the lowering or are rejected with Z0005.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 literal_member_arrays matches its frozen golden in the interpreter; string | null, number | null and boolean | null work in variables, parameters, returns, ?? and narrowing
<!-- AC:END -->
