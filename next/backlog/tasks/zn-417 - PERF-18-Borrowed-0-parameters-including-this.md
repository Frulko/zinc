---
id: ZN-417
title: PERF-18 Borrowed (+0) parameters including this
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-413
priority: medium
ordinal: 5170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rc.cpp:24 consumes(): a call consumes its arguments, so every call that passes an object it keeps retains it and the callee releases it (hero start: 153k retains for 2.4k allocations). Make parameters borrowed by default; the callee retains only what it stores or returns; change the RC pass and the native ABI together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc mem retains on hero start -50%
- [ ] #2 ui-heavy demo script time -10% (AOT)
- [ ] #3 ASan corpus clean, native module ABI version bumped with tests
<!-- AC:END -->
