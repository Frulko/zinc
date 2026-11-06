---
id: ZN-1001
title: Measure and fix the worker loop leak
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 09:36'
labels:
  - size-S
  - perf
  - runtime
dependencies: []
ordinal: 760080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read in the sidecar session: src/host/loop.cpp:30 may leak per worker or per message. Measure first: a zinc:worker program that starts/stops workers and posts messages for minutes, RSS sampled. Fix only if it grows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Measurement recorded (RSS over time, before and after) in the task notes
- [ ] #2 If it leaks: fixed in the engine with a regression test bounding the growth; if not: the reading is refuted in the notes and nothing is changed
<!-- AC:END -->
