---
id: ZN-431
title: Remove unreachable functions from the ZBC module
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-09 09:49'
labels:
  - perf
milestone: m-22
dependencies: []
ordinal: 5001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a reachability pass before encoding, starting from main, the vtables of constructed classes, closures, and the functions that runtime rows call back. It helps both the interpreter and AOT. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 game-2d ZBC is at most 30 KB (60 181 B today)
- [ ] #2 every T0/T1 golden is identical in the interpreter, AOT and the device core
- [ ] #3 a test with promise jobs, timers and onFrame keeps its call-backs
- [ ] #4 the ESP32 export of game-2d's logic fits 48 KB
<!-- AC:END -->
