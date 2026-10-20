---
id: ZN-024
title: Benchmarks against QuickJS and native
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 13:37'
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
- [x] #1 median of 11 runs of the M4 kernels (interpreter, AOT, QuickJS, current native) with a JSON artifact kept (next/bench/m4.json, made by tools/bench-m4)
- [x] #2 M4 demo: the benchmark table with every threshold of next/TESTING.md, losses included, committed (docs/reports/zinc-next-m4-benchmarks.md); meeting the thresholds is ZN-025 and ZN-026
<!-- AC:END -->
