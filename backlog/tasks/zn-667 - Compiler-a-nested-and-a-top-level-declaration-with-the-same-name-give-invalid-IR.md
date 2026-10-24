---
id: ZN-667
title: >-
  Compiler: a nested and a top-level declaration with the same name give invalid
  IR
status: Backlog
assignee: []
created_date: '2026-10-10 18:50'
labels:
  - compiler
  - bug
  - size-S
dependencies: []
ordinal: 13800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) Noted in a task in Review and never filed: duplicate nested and top-level names lower to invalid IR; a fuzzer fixture exists (tests/fuzz).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the fuzzer fixture compiles and runs with the output of the oracle, or is refused with a Z diagnostic
- [ ] #2 a regression program in tests/golden/run
<!-- AC:END -->
