---
id: ZN-139
title: >-
  Compatibility harness: test262 subset, WPT, Node API tests, QuickJS tests on
  the new engine
status: Done
assignee: []
created_date: '2026-10-06 23:01'
updated_date: '2026-10-08 01:01'
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
- [x] #1 the report reproduces the prototype's numbers (WPT URL 896/896 and setters 278/278) and states the rest
- [x] #2 a regression gate fails T2 when a passing test starts to fail
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tests/compat/run.mjs gains the engines next (typed, zinc run file.js) and next-qjs (plain JavaScript on the QuickJS-ng engine, zinc run --engine quickjs), keeps the prototype's report, results and baseline entries (merge), writes docs/reports/zinc-next-compat.md and zinc-next-compat-failures.txt and results/next-<date>.json. Numbers: test262 next 92/2113 (rejected at compile time 1728, unsupported 272), next-qjs 2024/2113 (95.8%); quickjs tests next-qjs 73/90; WPT 0/222 on both (the typed ports are rejected and QuickJS has no web globals yet: stated in the report); Node API 0/19; WPT URL data 896/896 and setters 278/278 through wpt_url.ts. Gate: next/tests/t2/compat.sh fails when a baseline test stops passing (checked with a doctored baseline); a race between the shim copies that made passing tests fail was fixed on the way.
<!-- SECTION:NOTES:END -->
