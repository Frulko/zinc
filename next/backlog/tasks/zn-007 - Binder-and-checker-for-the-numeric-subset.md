---
id: ZN-007
title: Binder and checker for the numeric subset
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:36'
labels:
  - size-L
milestone: m-1
dependencies:
  - ZN-005
  - ZN-006
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want types checked (numbers, functions, returns), so that a wrong program fails at compile time with a clear message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on a 30-file differential set, every program we accept is accepted by the oracle (`next/tools/oracle`); any violation is a bug; rejections of invalid fixtures carry a Z-code; notes record which parts were ported from the reference checker.
<!-- AC:END -->
