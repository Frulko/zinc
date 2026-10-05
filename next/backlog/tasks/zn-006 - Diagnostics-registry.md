---
id: ZN-006
title: Diagnostics registry
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
labels:
  - size-S
milestone: m-1
dependencies:
  - ZN-005
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As an **App developer**, I want every error to have a code, a title, a reason, a fix and an example, so that I can run `zinc explain Z1006`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 registry file drives messages and docs; one fixture per code; `zinc explain` prints the entry.
<!-- AC:END -->
