---
id: ZN-427
title: PERF-28 Parallel AOT compile in several translation units
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
main.cpp:1349 compiles one C++ file per program at -O2: zinc build of navigation takes 81 s (68 s user). Split generated functions into N TUs compiled with the machine's job limit (3 on 16 GB machines), cache objects by function hash.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 navigation zinc build <= 30 s at -j3
- [ ] #2 incremental rebuild after a one-function change <= 5 s
- [ ] #3 generated program identical in behaviour (AOT corpus)
<!-- AC:END -->
