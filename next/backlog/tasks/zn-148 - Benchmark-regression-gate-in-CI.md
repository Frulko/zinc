---
id: ZN-148
title: Benchmark regression gate in CI
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
labels:
  - performance
  - tests
  - size-S
milestone: m-12
dependencies: []
ordinal: 40900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bench-m4 --check-regressions in the T2 workflow on the macOS and Linux runners with stored per-machine baselines (relative ratios against QuickJS, not absolute times), the table published as a workflow artifact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a deliberate 20% slowdown in a branch fails the job
<!-- AC:END -->
