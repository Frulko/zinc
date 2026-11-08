---
id: ZN-708
title: 'Web environment: what Date.now and new Date() give under the virtual clock'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 22:51'
labels:
  - js
  - qjs
  - size-S
milestone: m-22
dependencies: []
ordinal: 7100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Write the decision record and a test: windowed run gives today's date, deterministic run the same date every run.

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) `Date.now` is the virtual clock from 0 in a deterministic run, so `new Date()` is 1970 in a web program; libraries seed, log and expire caches with it. Decide (the real date outside deterministic runs, a fixed epoch inside) and record it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a decision record
- [ ] #2 a windowed run gives today's date and a deterministic run the same date at every run (test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Date.now is already the wall clock outside test runs and fractional virtual in deterministic runs; left: the decision record and one test. Evidence: git: 60193313e, fbb3e2fb7, d28d804df
<!-- SECTION:NOTES:END -->
