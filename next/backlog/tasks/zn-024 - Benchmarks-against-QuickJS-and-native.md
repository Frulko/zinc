---
id: ZN-024
title: Benchmarks against QuickJS and native
status: Backlog
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-05 14:22'
labels:
  - size-M
milestone: m-4
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the **Maintainer**, I want honest numbers, including losses (lesson from PerryTS).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 median of 11 runs; `fib`, `nbody`, `binarytrees`, `sort` within 3× of native on AOT; interpreter ≥ 5× QuickJS on numeric kernels and never slower than QuickJS on `strings`, `jsonout` and a `Dyn` kernel; JSON artifact kept.
<!-- AC:END -->
