---
id: ZN-069
title: Default parameters and type-parameter defaults
status: Done
assignee: []
created_date: '2026-10-06 22:50'
updated_date: '2026-10-07 01:06'
labels:
  - language
  - size-S
milestone: m-13
dependencies: []
ordinal: 40110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Infer an unannotated default (`b = 2` is f64), allow defaults that read earlier parameters, defaults on lambdas, `T = never` and other type-parameter defaults, optional `Arena.frame(bytes?)`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures for each form; lambda defaults no longer Z0005
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Defaults: inferred from literals (parser), reading earlier parameters (call-site substitution), on lambdas and optional lambda parameters (T | null plus a prologue; function types count required parameters), type-parameter defaults (class, alias, function, inference fallback; never reads as null), Arena.frame(bytes = 0). Parser AST dump gained the default-type kid of TypeParam (goldens generics/unions regenerated).
<!-- SECTION:NOTES:END -->
