---
id: ZN-613
title: >-
  system_instance fails when a cold zinc run compiles for longer than its 10 s
  wait
status: Backlog
assignee: []
created_date: '2026-10-10 07:27'
labels:
  - test
  - flaky
  - size-S
milestone: m-16
dependencies: []
priority: low
ordinal: 168040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/t1/system_instance.sh gives the first instance 10 s to print `first instance`. It runs under an empty HOME, so that first `zinc run` compiles the program: 74 s wall (194 s CPU) on the Intel Mac while Homebrew built in parallel, 0.2 s once cached. The second instance then starts first, takes the lock and the test fails (`second instance: 'first instance ...'`). It passed on the same machine when idle. Warm the program before the race (a first run or `zinc build` under the same HOME) or wait on a readiness file with a longer bound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 system_instance passes while another build loads every core
<!-- AC:END -->
