---
id: ZN-601
title: >-
  QuickJS binding rules for native modules, with the boundary micro-benchmark in
  next/bench
status: Backlog
assignee: []
created_date: '2026-10-09 09:29'
labels:
  - perf
  - quickjs
  - docs
  - size-S
milestone: m-21
dependencies:
  - ZN-567
priority: medium
ordinal: 5670
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write down what the report measured so plugin and WebGL code stops paying hidden costs: never use an exception as a type test (1.3-2.3 us, growing ~42 ns per JS frame of depth); no heap allocation per call (two std::vector reserves cost ~110 ns); atoms created once (JS_NewAtom), never JS_SetPropertyStr in hot paths; results as numbers or written into a shared typed array, not new objects (150-185 ns per {x,y,z}); coarse-grained calls over per-element calls; no JS-side command buffers on QuickJS (300-430 ns per recorded command vs 45 ns for the direct call); JS_Call from native ~14 ns. Add the harness's boundary.js as next/bench/qjs_boundary with a T2 regression gate. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a section 'Binding to QuickJS' in docs/plugins.md (or the native ABI doc) with the rules and the numbers
- [ ] #2 next/bench/qjs_boundary runs in tools/bench and fails when a listed call regresses by more than 30%
- [ ] #3 libzn_webgl and src/qjs pass the rules (grep checks for JS_GetArrayBuffer-then-throw and per-call std::vector in thunks)
<!-- AC:END -->
