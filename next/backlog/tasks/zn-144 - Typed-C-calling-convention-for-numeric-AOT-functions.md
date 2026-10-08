---
id: ZN-144
title: Typed C calling convention for numeric AOT functions
status: Done
assignee: []
created_date: '2026-10-06 23:02'
updated_date: '2026-10-08 04:16'
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
- [x] #1 fib AOT within 1.3x of native in bench-m4 (median of 11); mandelbrot/spectralnorm/sort/nbody not slower
- [x] #2 T2 diff matrix: interpreter, AOT and corpus agree; stack overflow and traps still reported
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Measured first (hand-written fib variants): the cost was the call-depth counter (a store and a load per call in m.depth), not the window: typed parameters + stack-pointer check ran at 0.77x of native, the window with only a stack check at 1.3x. Done: (1) compiled functions no longer count depth: entry check is op::stackLow(m) (frame address against Machine::cLimit, the thread's stack low end + 256 KiB, set in Machine::load) and, for window functions, the register window against stackEnd (windows outside the stack, like the temporary one of an exception text, are not checked); (2) numeric functions (scalar parameters and result, no references, no handlers, only register ops and calls to such functions) become C functions with typed parameters, registers as locals and a failure flag (m.failed, checked after typed calls); the window entry stays as a thin wrapper (fN) for the interpreter, virtual calls and untyped callers. bench-m4 (median of 11): fib AOT/native 1.82x -> 1.22x; mandelbrot 1.21 -> 1.25 (noise), spectralnorm 1.18 -> 1.15, nbody 2.92 -> 2.90, sort now builds (1.17x; it failed before), binarytrees 18.4 -> 21.7 ms and mapset 23.3 -> 25.1 ms slightly slower in the harness (standalone runs equal). T2 diff matrix: 125 programs interpreter = AOT, stack overflow message and exit code equal (tests/t1/aot.sh, typed recursion without end). zbc decode of a truncated file says truncated. Not done: refs in typed functions, float typed locals (all registers stay Slot), main stays untyped.
<!-- SECTION:NOTES:END -->
