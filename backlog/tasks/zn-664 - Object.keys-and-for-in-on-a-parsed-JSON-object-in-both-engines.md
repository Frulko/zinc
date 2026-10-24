---
id: ZN-664
title: 'Object.keys and for-in on a parsed JSON object, in both engines'
status: Backlog
assignee: []
created_date: '2026-10-10 18:49'
labels:
  - language
  - size-S
dependencies: []
ordinal: 4500
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum table (ZN-650.01): a program cannot list the keys of a value returned by JSON.parse (no Object.keys, no for-in on a Dyn), so a loader cannot keep or report the unknown fields of a file and drops them on save.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Object.keys(x) and for (const k in x) on a parsed JSON object give its keys in file order, on the interpreter, the AOT and QuickJS (golden)
- [ ] #2 the oracle accepts the test program
<!-- AC:END -->
