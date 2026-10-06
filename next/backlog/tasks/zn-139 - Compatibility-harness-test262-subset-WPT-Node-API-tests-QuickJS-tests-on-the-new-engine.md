---
id: ZN-139
title: >-
  Compatibility harness: test262 subset, WPT, Node API tests, QuickJS tests on
  the new engine
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
labels:
  - tests
  - size-M
milestone: m-10
dependencies:
  - ZN-090
  - ZN-095
ordinal: 40810
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Point tests/compat/run.mjs (WPT, test262, Node API, QuickJS tests) at `zinc run` and the QuickJS engine, publish the numbers per suite in docs/reports/zinc-next-compat.md with the failure lists, and gate regressions in T2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the report reproduces the prototype's numbers (WPT URL 896/896 and setters 278/278) and states the rest
- [ ] #2 a regression gate fails T2 when a passing test starts to fail
<!-- AC:END -->
