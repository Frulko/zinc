---
id: ZN-150
title: 'Spike: baseline JIT for ZBC (sljit) — measure, then decide'
status: Backlog
assignee: []
created_date: '2026-10-06 23:03'
labels:
  - performance
  - spike
  - size-L
milestone: m-12
dependencies:
  - ZN-144
ordinal: 40920
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D13 says no JIT now; this spike produces the numbers to confirm or reverse it. Study the prototype's AArch64 JIT (runtime/vm), prototype a sljit baseline JIT for hot ZBC functions on arm64 and x86-64 (arithmetic, calls, field/array access, exceptions via status), compare with the interpreter (5x QuickJS) and AOT on the bench kernels and on the UI frame loop where no compiler is available at run time. Record the verdict in the decisions file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bench table: interpreter vs JIT vs AOT on fib, nbody, mandelbrot, spectralnorm, sort, hero frame time
- [ ] #2 a recorded go/no-go with the criteria (adopt if the JIT gives at least 2x over the interpreter on UI and numeric code without correctness gaps)
<!-- AC:END -->
