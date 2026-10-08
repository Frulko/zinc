---
id: ZN-353
title: 'Native plugin ABI v1 frozen: what may change, what a plugin can rely on'
status: Backlog
assignee: []
created_date: '2026-10-08 14:42'
labels:
  - plugins
  - abi
  - size-M
milestone: m-19
dependencies: []
ordinal: 55410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
D37: official plugins leave the monorepo only once the native ABI is frozen. Review include/zn/native.h and the thunk generator, write the stability rules (additive changes only within a major ABI version, the loader refusing an unknown major), a check that the ABI header did not change incompatibly (tool comparing the declarations against a recorded v1 snapshot), and the list of plugins ready to move out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the ABI rules are in docs/plugins.md and a T0 test fails when native.h changes incompatibly against the v1 snapshot
- [ ] #2 the loader refuses a module built for another major ABI with a message naming both versions
- [ ] #3 a module built for an older minor ABI still loads
<!-- AC:END -->
