---
id: ZN-146
title: AOT and interpreter startup time
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
labels:
  - performance
  - size-S
milestone: m-12
dependencies: []
ordinal: 40880
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A program that prints one line takes 5.3 ms against 2 ms for an empty C program; the runtime's own work is 0.12 ms and the process maps 8 MB it does not touch (ZN-042 investigation). Find the pre-main cost (mimalloc arena reserve, dynamic loading, static data) with a sampling run on many launches and remove it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `console.log(1)` AOT under 3 ms on the benchmark machine; `zinc run` of the same under 15 ms; numbers recorded in bench/m4.json
<!-- AC:END -->
