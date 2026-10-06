---
id: ZN-079
title: Examples status runner and gate
status: Backlog
assignee: []
created_date: '2026-10-06 22:51'
labels:
  - examples
  - tools
  - size-S
milestone: m-15
dependencies:
  - ZN-078
ordinal: 40210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/examples-status runs every entry of every example (63 entries today, discovered from zinc.json) headless for N frames and prints a table OK/COMPILE/RUNTIME/CRASH with the first error; next/tests/examples.lst records the expected status per entry with a reason for each xfail and the task that will fix it. tests/t1/examples_all.sh fails when an entry that was OK regresses or an xfail starts to pass without being promoted (so progress is forced into the list).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the list covers all 63 entries of the audit with their current status
- [ ] #2 regressions and unexpected passes fail T1; the tool prints the unlock count per xfail reason
<!-- AC:END -->
