---
id: ZN-643
title: Write the program's output before a blocking host call
status: Backlog
assignee: []
created_date: '2026-10-10 17:11'
labels:
  - runtime
  - size-S
milestone: m-20
dependencies: []
ordinal: 50340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-638 (D65) writes console output at each event-loop turn. A host call that blocks or starts a child (zinc:process, a stdin read) still runs before what the program printed in the same turn is written. Flush the machine's output before such calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a prompt printed before a blocking stdin read is visible before the read
- [ ] #2 the parent's lines come before the output of a child that inherits stdout
- [ ] #3 a test on the interpreter and the AOT
<!-- AC:END -->
