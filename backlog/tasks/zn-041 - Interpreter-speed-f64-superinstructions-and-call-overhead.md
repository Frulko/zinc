---
id: ZN-041
title: 'Interpreter speed: f64 superinstructions and call overhead'
status: Done
assignee: []
created_date: '2026-10-06 14:43'
updated_date: '2026-10-06 19:41'
labels: []
dependencies: []
priority: medium
ordinal: 33100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Interpreter is 4.4x (fib), 3.0x (mandelbrot), 4.8x (spectralnorm) QuickJS; target 5x. See the m4 report update after ZN-026.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fib, mandelbrot and spectralnorm reach 5x QuickJS in tools/bench-m4 on an idle machine
- [x] #2 T0-T2 stay green, goldens regenerated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Branch threading, CSE, div by power of two, hoist after inlining, self-recursion unroll, two superinstructions. fib 5.44x, nbody 5.43x, mandelbrot 6.91x, spectralnorm 5.37x, fannkuchredux 6.43x in tools/bench-m4 (machine loaded, ratios have noise). T0-T2 green, zbc/aot goldens regenerated.
<!-- SECTION:NOTES:END -->
