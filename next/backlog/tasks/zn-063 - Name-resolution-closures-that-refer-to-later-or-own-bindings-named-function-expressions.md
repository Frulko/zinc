---
id: ZN-063
title: >-
  Name resolution: closures that refer to later or own bindings, named function
  expressions
status: Backlog
assignee: []
created_date: '2026-10-06 22:48'
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
- [ ] #2 the audit rows fs_ext, sys_process, focus_keys compile
<!-- AC:END -->
