---
id: ZN-069
title: Default parameters and type-parameter defaults
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
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
- [ ] #1 fixtures for each form; lambda defaults no longer Z0005
<!-- AC:END -->
