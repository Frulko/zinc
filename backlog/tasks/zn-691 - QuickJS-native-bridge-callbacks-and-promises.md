---
id: ZN-691
title: 'QuickJS native bridge: callbacks and promises'
status: Backlog
assignee: []
created_date: '2026-10-10 19:46'
labels:
  - qjs
  - plugins
  - size-M
dependencies: []
ordinal: 452410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the first playable pinball, D77.) The generic bridge that lets a plugin's native module be called from QuickJS (src/qjs/native_js.cpp) passes values and arrays; a native function that takes a callback or returns a promise is not bridged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a native module function taking a callback and one returning a promise work from QuickJS as from compiled code (test)
- [ ] #2 plugins with such members are listed, with what now works
<!-- AC:END -->
