---
id: ZN-063
title: >-
  Name resolution: closures that refer to later or own bindings, named function
  expressions
status: Review
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-07 00:13'
labels:
  - language
  - size-S
milestone: m-13
dependencies: []
ordinal: 40050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bind the name of a named function expression inside its own body; allow a closure to use a `const` of the enclosing scope declared later (temporal dead zone check at run time) or in its own initializer (`const poll = () => { setTimeout(poll, 5) }`). Parity audit 01 lists fs_ext, sys_process, focus_keys and two more rows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures: recursive const arrow, named function expression recursion, closure using a later const after it is initialised (works) and before (throws ReferenceError semantics: trap with the name)
- [x] #2 the audit rows fs_ext, sys_process, focus_keys compile
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: own-binding recursive arrows (annotated), named function expressions (cell holding own closure), closures using later top-level consts of known type, self-referencing initializers (setInterval/watch ids). Not done: AC1's read-before-init trap, moved to the follow-up task; self-referencing closures leak (rc cycle).
<!-- SECTION:NOTES:END -->
