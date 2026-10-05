---
id: ZN-008
title: Typed SSA IR and `--emit=ir`
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-007
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want a complete typed SSA IR with a stable text dump, so that every backend derives from one source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `fib` IR matches a golden; effects and exceptional edges are representable; verifier rejects malformed IR.
<!-- AC:END -->
