---
id: ZN-1122
title: Preserve nested closure identity beside an exported property of the same name
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 03:38'
labels:
  - compiler
  - size-S
dependencies: []
type: bug
ordinal: 53201
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-558 generic GATT simulator cannot compile its natural TypeScript: a named helper containing Array.find and an exported object property with the same name produce unrelated closure classes after reference counting. Reproduce from .worktrees/558-gatt/.logs/gatt-ir-repro; fix shared compiler closure identity without renaming caller helpers or weakening IR validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The minimal named helper plus same-name exported arrow and nested Array.find compiles and prints found on interpreter, AOT and QuickJS
- [ ] #2 A small exact T0 regression covers lexical closure identity and the original BLE simulator compiles unchanged
<!-- AC:END -->
