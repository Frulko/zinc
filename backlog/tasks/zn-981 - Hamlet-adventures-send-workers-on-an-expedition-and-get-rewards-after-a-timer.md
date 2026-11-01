---
id: ZN-981
title: >-
  Hamlet: adventures: send workers on an expedition and get rewards after a
  timer
status: Backlog
assignee: []
created_date: '2026-11-01 13:13'
labels:
  - hamlet
  - demo
  - m3
  - progression
  - size-M
milestone: m-30
dependencies:
  - ZN-979
  - ZN-980
ordinal: 740080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settlers Online-style, simplified: an adventure def (duration, cost, risk, rewards) in data; workers leave and return, some may be lost. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 adventures.json with 3 adventures; start/return are commands
- [ ] #2 Workers absent from jobs while away; risk uses the sim PRNG
- [ ] #3 Test: deterministic result for a seed; save mid-adventure round trips
<!-- AC:END -->
