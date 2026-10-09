---
id: ZN-599
title: 'Spike (decision): QuickJS bytecode to C AOT (qjs2c) with inline caches'
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
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
- [ ] #1 numbers for the four workloads of the report (three, sprite, matter-js, objects) interpreted vs AOT, plus code size
- [ ] #2 test262 subset and the QuickJS T1 tests give identical results with AOT on
- [ ] #3 a go/no-go recorded against D44 with a revisit condition
<!-- AC:END -->
