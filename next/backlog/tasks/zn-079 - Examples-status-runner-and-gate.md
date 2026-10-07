---
id: ZN-079
title: Examples status runner and gate
status: Done
assignee: []
created_date: '2026-10-06 22:51'
updated_date: '2026-10-07 02:37'
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
- [x] #1 the list covers all 63 entries of the audit with their current status
- [x] #2 regressions and unexpected passes fail T1; the tool prints the unlock count per xfail reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/examples-status (table, --check, --write-list) runs every entry headless; tests/examples.lst lists 62 entries (the 61 rows of the audit table that name a source file, plus process/cli and zed-editor/src/main.tsx found from the tree): 36 OK, 23 COMPILE, 2 RUNTIME, 1 CRASH, each failing one with its reason and the task that fixes it; tests/t1/examples_all.sh fails on a regression, an unexpected pass, a changed status, a missing or incomplete row; the check prints the entries still blocked per task. The audit's number 63 counts two non-app files too; 62 is what the tree holds.
<!-- SECTION:NOTES:END -->
