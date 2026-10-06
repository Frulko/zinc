---
id: ZN-144
title: Typed C calling convention for numeric AOT functions
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
labels:
  - performance
  - aot
  - size-M
milestone: m-12
dependencies: []
ordinal: 40860
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-042: functions whose parameters and result are numbers, booleans or references compile to C functions with typed parameters and a direct call (no Slot window) with a stack-pointer overflow check and a failure flag checked after calls that may trap; the Slot entry stays as a thin wrapper. Measure first on fib (1.42x native today).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fib AOT within 1.3x of native in bench-m4 (median of 11); mandelbrot/spectralnorm/sort/nbody not slower
- [ ] #2 T2 diff matrix: interpreter, AOT and corpus agree; stack overflow and traps still reported
<!-- AC:END -->
