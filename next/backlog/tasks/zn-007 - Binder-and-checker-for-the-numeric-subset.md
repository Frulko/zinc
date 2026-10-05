---
id: ZN-007
title: Binder and checker for the numeric subset
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
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
- [ ] #1 accepts/rejects the same fixtures as `tsgo` on a 30-file differential set; any disagreement on an accepted program is a bug; checker port notes recorded.
<!-- AC:END -->
