---
id: ZN-018
title: Explicit RC insertion and elision
status: Backlog
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-05 14:22'
labels:
  - size-L
milestone: m-3
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want retain/release ops inserted by a pass, so that destruction order is identical on every backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 live-object count 0 at exit on the corpus; destruction-order fixtures equal the current native results.
<!-- AC:END -->
