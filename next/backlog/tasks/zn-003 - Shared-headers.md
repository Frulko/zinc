---
id: ZN-003
title: Shared headers
status: Ready
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:54'
labels:
  - size-S
milestone: m-0
dependencies:
  - ZN-002
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want opcodes, value layouts, limits and ABI constants defined once in `include/zn/`, so that the compiler and VM cannot diverge (recursion limit defined once, unlike today's 1024 vs 16383).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a stub compiler and a stub VM include the same header; one test fails if either redefines a constant.
- [ ] #2 M0 demo: next/tests/run --tier t1 on the frozen corpus with the stub binary prints only totals
<!-- AC:END -->
