---
id: ZN-668
title: 'Runtime: a closure that refers to itself is never freed'
status: Backlog
assignee: []
created_date: '2026-10-10 18:50'
labels:
  - runtime
  - bug
  - size-S
dependencies: []
ordinal: 424410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) Noted in a task in Review and never filed: `const f = () => { ... f ... }` keeps a reference to itself, so its environment is never released (live objects are not 0 at exit).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program with a self-referring closure exits with 0 live objects on the interpreter and the AOT (test)
- [ ] #2 the cost on the closure call path is measured
<!-- AC:END -->
