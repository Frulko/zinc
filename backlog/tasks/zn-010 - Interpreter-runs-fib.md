---
id: ZN-010
title: Interpreter runs `fib`
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-06 07:10'
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
UPDATE after the maintainer chose to invest in interpreter speed (option 2 of the gate question): added ZBC ops AddI32K (immediate add/sub), fused compare-and-jump (JEqI..JLeU, JEqIK..JGeIK, two words: operands + absolute target) with instruction-length-aware verifier, disassembler and VM; emitter folds single-use small constants and fuses a compare feeding a CondBr; register allocator hints a call argument into its window slot (removes the Move before Call). fib(32): 112 ms -> ~55 ms; speedup vs QuickJS 2.15x -> 4.4-4.5x (median of 21: see next/bench/m1-fib.json). THRESHOLD 5x STILL NOT MET (about 10 percent short). mandelbrot unchanged at 2.7x (float loops: constants reloaded each iteration, && chains not fused: needs LICM and float fused jumps, planned in ZN-026). Tried and rejected: direct threading (slower: 70 ms), -O3, single depth check, uninitialised stack (no change). fib cost is now ~1.9 ns per instruction, dominated by call/return and indirect-branch prediction. Remaining ideas: fused op+Ret, caching code pointers in frames, float immediates/fused float jumps, IR-level LICM. Tests: T0 10/10 and T1 12/12 on clang, ASan/UBSan and zig c++; 600 randomly corrupted .zbc under ASan: 0 crashes (564 rejected, 30 ran safely, 1 runtime error, 5 timeouts = corrupted loops, the verifier guarantees memory safety not termination). usage: 1114338 in / 45990046 cached / 365642 out tokens, 199 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
