---
id: ZN-976
title: >-
  Hamlet: services by roaming walkers and a market (coverage counters that
  decay)
status: Backlog
assignee: []
created_date: '2026-11-01 13:12'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-943
  - ZN-974
ordinal: 740030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A service walker leaves its building, roams roads in a bounded random walk and sets a per-house counter that decays each day; covered = counter > 0. Market restocks house food from a store. Mechanism only, re-invented. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Market building and walker in data + model; house has serviceCounter[]
- [ ] #2 Counters decay per game day; uncovered houses are flagged by hints
- [ ] #3 Test: coverage over a fixed road layout is deterministic (hash)
<!-- AC:END -->
