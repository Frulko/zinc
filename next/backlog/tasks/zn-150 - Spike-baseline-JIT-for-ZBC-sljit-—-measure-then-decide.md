---
id: ZN-150
title: 'Spike: baseline JIT for ZBC (sljit) — measure, then decide'
status: Review
assignee: []
created_date: '2026-10-06 23:03'
updated_date: '2026-10-08 08:18'
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
- [x] #2 a recorded go/no-go with the criteria (adopt if the JIT gives at least 2x over the interpreter on UI and numeric code without correctness gaps)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. D36 in docs/reports/zinc-next-decisions.md: no-go, from the AOT upper bound (interpreter vs AOT on the kernels from bench/m4.json, and a UI frame 0.09 ms vs 0.033 ms), no sljit prototype was built. AC1 (a JIT column in the bench table) is not met: the column is replaced by the AOT bound.
<!-- SECTION:NOTES:END -->
