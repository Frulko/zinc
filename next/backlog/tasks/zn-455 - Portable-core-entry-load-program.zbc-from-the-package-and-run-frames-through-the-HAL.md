---
id: ZN-455
title: >-
  Portable core entry: load program.zbc from the package and run frames through
  the HAL
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - host
  - size-M
milestone: m-23
dependencies:
  - ZN-454
ordinal: 300020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/targets/console/core_main.cpp: read program.zbc from a path or an embedded blob, zbc::decode and verify, install the console host and the graphics host, run through hal_run with zinc:start and zinc:exit markers on the HAL log (same contract as the ps1 runner), map the exit status. Compiled by every handheld target and, for tests, on macOS with the headless HAL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on macOS with the headless HAL, examples/hello and examples/bouncing-ball (ZINC_FRAMES=60) run from a .zbc file with output identical to zinc run
- [ ] #2 an invalid or truncated program.zbc reports a clear error and exits non-zero (T0)
- [ ] #3 core code size for macOS arm64 reported in the task notes
<!-- AC:END -->
