---
id: ZN-010
title: Interpreter runs `fib`
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 22:29'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-009
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Device user**, I want a bytecode file to run on a VM, so that no C++ compiler is needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc run fib.ts` prints the golden output, with no Node.js on the machine; sanitizer build clean.
- [x] #2 M1 gate thresholds from next/TESTING.md are measured and recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/vm/vm.{h,cpp}: computed-goto ZBC interpreter, explicit frames, no tag checks, JS number formatting, 'zinc run <file.ts|file.zbc>'. kMaxCallDepth decided: 10000 (stack bounded by depth alone). Correctness: fib and mandelbrot equal the frozen corpus outputs without Node; 13 extra numeric goldens (calls with live values and parallel-move cycles, loop-carried swaps, bits, float formatting, globals, the 7 emitting checker programs) generated with Node once and matched exactly; runtime errors (division by zero, stack overflow) reported not crashed; 300 randomly corrupted .zbc files under ASan: 271 rejected by decode/verify, 26 ran safely, 3 clean runtime errors, 0 crashes or hangs. Sanitizer and zig c++ builds pass T0 and T1. M1 GATE MEASUREMENTS (median of 11, tools/bench-m1, artifacts next/bench/m1-*.json, Apple silicon, release build): fib 111.9 ms vs QuickJS 240.4 ms = 2.15x (threshold 5x: NOT MET), mandelbrot 259.8 ms vs 691.9 ms = 2.66x, Node (JIT, reference) 50 ms for both. Startup 7.8 ms (qjs 7.1). Findings: ~60M instructions for fib(32) at ~1.9 ns each; -O3, a single depth check and uninitialised stack did not move it. A plain C++ interpreter will not reach 5x on call-heavy code; candidates if the maintainer wants it: immediate-operand ops and fused compare-and-branch (about 40 percent fewer instructions), direct threading, call-frame inlining; the design already puts the speed claim on the AOT path (M4). Risk found: libm differs from V8 (fdlibm) in the last digit for tan(1) (1.557407724654902 vs 1.5574077246549023); sin, cos, atan2, exp, log, atan matched on the tested inputs; transcendental goldens need a bundled fdlibm before M4/M5. Other gate items: checker differential 43 files, 0 violations (ZN-007); fib needs no Node; M1 usage figure below. usage: 621499 in / 36599480 cached / 325775 out tokens, 179 turns (session total, estimate, covers M0 and M1)
<!-- SECTION:NOTES:END -->
