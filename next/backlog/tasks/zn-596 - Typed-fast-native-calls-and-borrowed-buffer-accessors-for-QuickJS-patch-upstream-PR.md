---
id: ZN-596
title: >-
  Typed fast native calls and borrowed buffer accessors for QuickJS (patch +
  upstream PR)
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
labels:
  - perf
  - quickjs
  - webgl
  - size-M
milestone: m-21
dependencies:
  - ZN-595
  - ZN-567
priority: high
ordinal: 5620
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured in the report (M1 Pro harness): a generic C method with 4 doubles costs 40-45 ns over the empty loop, 28 ns through a typed fast path taken straight from OP_call_method (no JS_CallInternal, no stack frame, no JS_ToFloat64 calls); 1 int 27 -> 21 ns; int + Float32Array 32-34 -> 25-26 ns. Add to the patch queue: (1) a JS_CFUNC_fast prototype with a signature descriptor (f64, i32, u32, bool, borrowed typed-array pointer+length, opaque of `this` by class id), falling back to the generic function whenever a tag does not match; fast functions may not allocate, throw or re-enter JS; (2) JS_GetTypedArrayData (borrowed pointer, length, element size, no throw, no dup: 33-36 ns path vs 39-43 with the public checks) and a borrowed fast-array accessor for plain Arrays of numbers (what accelerators need). Bind the runtime table's host rows (letters d, i, u, b) and the hot WebGL entry points (uniform*, bind*, enable/disable, vertexAttribPointer, drawArrays/drawElements, viewport) as fast functions, generated from their signatures. Open an upstream PR to quickjs-ng for (1) and (2). (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a next/bench micro-benchmark (the report's boundary.js shape) shows 4-double calls <= 30 ns and int calls <= 22 ns over the empty loop on the M1 Pro (today 40-45 and 27-29)
- [ ] #2 __host_* rows with only d/i/u/b letters are fast functions; a zinc:gfx host call from QuickJS costs <= 40 ns raw (today ~150 ns, ~35 after ZN-567's stack arrays)
- [ ] #3 WebGL conformance unchanged (695 of 787 or better); fallback path covered by a test that passes strings, objects and detached buffers
- [ ] #4 upstream PR opened on quickjs-ng (link in the patch header)
<!-- AC:END -->
