---
id: ZN-644
title: >-
  console.error and sys.exit leak program output to stdout under profile, mem
  and the device core
status: Backlog
assignee: []
created_date: '2026-10-10 17:11'
labels:
  - runtime
  - bug
  - size-S
milestone: m-20
dependencies: []
ordinal: 4700
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-638, older than it: flushErrLine and host.sysExit write Machine::out to stdout whatever the host is, so `zinc mem --json` or `zinc profile` of a program that calls console.error mixes the program's output into the report, and the device core's out frame misses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc mem --json of a program that calls console.error prints only the report on stdout
- [ ] #2 the device core's out frame holds the whole output
- [ ] #3 a regression test
<!-- AC:END -->
