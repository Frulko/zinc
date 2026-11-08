---
id: ZN-1026
title: >-
  First run: build the plugins concurrently, interpret at once while the native
  build continues
status: Backlog
assignee: []
created_date: '2026-11-07 16:36'
labels:
  - perf
  - cli
  - first-run
  - size-M
milestone: m-12
dependencies: []
ordinal: 1018000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first run of a project that imports plugins is slow (ipod cold 75 s). Build the imported plugins concurrently with each other and the frontend, run a stale native program on the interpreter at once while its native build continues for the next run (hero), and remember a failed native build so a Mac without the Command Line Tools does not retry at every run. Aim: users see a window in seconds on a modest machine.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-774.16: a windowed `zinc run` whose native build fails (a Mac without the Command Line Tools) compiles and tries the C++ build at every run before interpreting: remember the failure beside the run cache and start from the cached ZBC.
- Build speed: build the plugins a project imports concurrently with each other and with the frontend (ipod cold 75 s toward ~30 s, sqlite3.c's 20 s the floor); the baked resources (~1.4 MB) in their own unit keyed by content, not in unit 0 (~1 s per rebuild).
- Build speed (owner's call, changes D43): run a stale native program on the interpreter at once while its native build continues in the background for the next run (hero edit-and-run ~1.5 s instead of 13-25 s).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program with two native plugins builds them in parallel (cold build time of ipod measured before/after in docs/reports/zinc-next-perf.md)
- [ ] #2 `zinc run` of a program with a stale native build opens at once on the interpreter and swaps to native on the next run
- [ ] #3 a failed native build is remembered until the toolchain changes
- [ ] #4 no D43 conflict: record the decision
<!-- AC:END -->
