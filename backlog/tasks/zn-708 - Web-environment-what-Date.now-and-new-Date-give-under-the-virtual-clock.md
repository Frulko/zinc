---
id: ZN-708
title: 'Web environment: what Date.now and new Date() give under the virtual clock'
status: Backlog
assignee: []
created_date: '2026-10-10 22:51'
labels:
  - js
  - qjs
  - size-S
milestone: m-22
dependencies: []
ordinal: 17200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) `Date.now` is the virtual clock from 0 in a deterministic run, so `new Date()` is 1970 in a web program; libraries seed, log and expire caches with it. Decide (the real date outside deterministic runs, a fixed epoch inside) and record it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a decision record
- [ ] #2 a windowed run gives today's date and a deterministic run the same date at every run (test)
<!-- AC:END -->
