---
id: ZN-599
title: 'Spike (decision): QuickJS bytecode to C AOT (qjs2c) with inline caches'
status: Done
assignee: []
created_date: '2026-10-09 09:28'
updated_date: '2026-10-10 10:50'
labels:
  - perf
  - quickjs
  - aot
  - decision
  - size-L
milestone: m-21
dependencies:
  - ZN-598
  - ZN-594
priority: medium
ordinal: 5650
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured by proxy in the report: the sprite loop translated by hand from QuickJS bytecode semantics to C (L1: JSValues, the interpreter's fast paths, generic calls, no dispatch, stack slots as C locals, borrowed locals) runs 1540 -> 263 ns per sprite (5.9x); with monomorphic inline caches and a guarded direct Math call (L1.5) 208 ns (7.4x); three r186's Matrix4.multiplyMatrices in L1 1.61 -> 0.33 us (4.9x, bit-identical with -ffp-contract=off), three frame -17% from that one function. Prior art is lower for mechanical translations (quickjs-aot, a Futamura projection of the interpreter: +36% on v8-v7; the quickjs-ng maintainer expects 1.2-1.5x, issue #1393) and 2.77x for SpiderMonkey's AOT with ICs (weval). Build a generator that turns a JSFunctionBytecode into a C function using the interpreter's opcode bodies extracted mechanically from quickjs.c (so quickjs-ng releases flow in), with operand-stack slots as C locals, borrowed references for locals not reassigned, per-site IC data, exceptions and backtraces through the existing frame, and an interpreter fallback for generators, async functions, with/eval and unsupported opcodes; a hook in JS_CallInternal calls the compiled body. Compile the hot functions chosen by QJS-05 with the pinned zig cc into the cached program (D43 model) or an export. Gate: >= 2x on the three.js CPU frame and on matter-js 300 bodies, code growth <= 15x the stripped bytecode of the compiled functions (the proxy measured 12-18x), test262 subset identical between interpreter and AOT. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 numbers for the four workloads of the report (three, sprite, matter-js, objects) interpreted vs AOT, plus code size
- [x] #2 test262 subset and the QuickJS T1 tests give identical results with AOT on
- [x] #3 a go/no-go recorded against D44 with a revisit condition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10: NO-GO, D55 (docs/reports/zinc-next-qjs2c.md).
Built tools/qjs2c (copies the interpreter's opcode bodies per instruction from quickjs.c: OP_CMP expanded, fall-through and shared slow paths followed, labels renamed, constant operands from a static bytecode array, direct jumps, atoms through a per-bytecode table) and patch 0002-aot-hooks (ZN_QJS_AOT: bind at first call by file/line/col/bytes, run in the interpreter's frame, exceptions back to its unwinding). Dumps come from the ZN-598 profiler (ZN_QJS_DUMP). CMake -DZN_QJS_AOT_GEN=<file>.
AC1 (idle Intel Mac, median of 3, 30 hottest functions per workload): three 7.31 -> 5.71 ms (1.28x), sprite 10.19 -> 7.28 (1.40x), objects 1.22 -> 1.13 (1.08x), matter-js 9.42 -> 7.32 (1.29x); code 61x the bytecode (T1 corpus 57x, test262 53x). Gate 2x / 15x: not met. Local C-array stack: same speed.
AC2: tests/t1/quickjs.sh passes with all 483 functions of its programs compiled (5 with finally interpreted); test262 regexp subset 2533/2557 with 861 functions compiled, same 24 known failures. Bug found and fixed on the way: class field initializers (line 0, same bytes) shared an atom table.
AC3: D55 against D44 with revisit conditions (2x needed on a no-JIT target after accelerators and ICs; quickjs-ng gains ICs or a register VM; a usable weval-style partial evaluator).
Also: the workloads now time themselves and run their frame in a function; bench/qjs/physics.mjs + fetch-matter (matter-js 0.20 from npm, sha256 checked, not vendored). tests/t0/qjs2c.sh. Correction of ZN-598's zero-cost numbers (they were -O0, zsh did not split the flags): -O2 gives the same instructions, 207,986 lines, __text 788,478 B; the unguarded dispatch costs nothing at -O2.
Tests: quickjs_patches, qjs2c, qjs_profile, quickjs, test262_regexp pass. usage: n/a
<!-- SECTION:NOTES:END -->
