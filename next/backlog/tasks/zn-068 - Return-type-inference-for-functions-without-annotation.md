---
id: ZN-068
title: Return type inference for functions without annotation
status: Backlog
assignee: []
created_date: '2026-10-06 22:49'
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
- [ ] #1 fixtures: plain, recursive with annotation, returning object literals, returning closures, returning mixed null/object
- [ ] #2 examples/pocket-hero passes this step
<!-- AC:END -->
