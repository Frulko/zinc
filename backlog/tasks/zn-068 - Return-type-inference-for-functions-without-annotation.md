---
id: ZN-068
title: Return type inference for functions without annotation
status: Done
assignee: []
created_date: '2026-10-06 22:49'
updated_date: '2026-10-07 00:52'
labels:
  - language
  - checker
  - size-M
milestone: m-13
dependencies:
  - ZN-067
ordinal: 40100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Z0109 appears for functions with no return annotation, including returned object literals of closures (pocket-hero has many). Infer the return type from the returns (union of distinct kinds, void when none), with recursion handled by requiring an annotation only when the type depends on itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures: plain, recursive with annotation, returning object literals, returning closures, returning mixed null/object
- [x] #2 examples/pocket-hero passes this step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Function declarations without a return annotation get their type from their returns, found lazily (first reference or end of the list); returns widen to a union for null/objects; a function needing itself must be annotated (Z0109). pocket-hero no longer reports return types; it stops on package imports (other task). Z0109 registry text and example changed.
<!-- SECTION:NOTES:END -->
