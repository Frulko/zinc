---
id: ZN-026
title: IR optimisation passes
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 14:43'
labels:
  - size-L
milestone: m-4
dependencies: []
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: inlining and devirtualisation show a measured gain on at least two kernels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 inlining and devirtualisation show a measured gain on at least two kernels.
- [ ] #2 the M4 thresholds of next/TESTING.md hold in tools/bench-m4 (interpreter at least 5x QuickJS on fib, mandelbrot, spectralnorm; AOT within 3x of native on nbody); losses recorded in docs/reports/zinc-next-m4-benchmarks.md
- [ ] #3 the dynsum kernel is not slower than QuickJS in tools/bench-m4 on an idle machine (small Dyn helpers inlined)
<!-- AC:END -->
