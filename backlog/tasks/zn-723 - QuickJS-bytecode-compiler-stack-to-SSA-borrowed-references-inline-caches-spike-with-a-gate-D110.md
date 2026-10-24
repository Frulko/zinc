---
id: ZN-723
title: >-
  QuickJS bytecode compiler: stack to SSA, borrowed references, inline caches
  (spike with a gate, D110)
status: Backlog
assignee: []
created_date: '2026-10-12 09:45'
updated_date: '2026-10-25 01:53'
labels:
  - perf
  - quickjs
  - aot
  - size-L
milestone: m-21
dependencies:
  - ZN-599
ordinal: 12600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, on examples/js-p5 at 40 fps: the number of boxes of a sketch must not matter; "we want a fast QuickJS or our VM fast", not a third-party engine. D110 keeps JavaScript libraries on QuickJS and gives it a compiler of its bytecode, ahead of time. D55 measured that copying the interpreter's opcode bodies gains 1.08x to 1.40x and named what the hand translations of docs/reports/quickjs-aot-jit-and-ffi.md section 3.3 did to reach 5.9x (L1) and 7.4x (L1.5): the operand stack and the locals in C variables, no reference count pair on a local read, a cache per property site, direct calls. Build that in tools/qjs2c for the hot functions the profiler of ZN-598 names (the bind hook of patch 0002 and the fallback to the interpreter exist): the stack depth is static at every instruction, so each slot becomes a value; a local is borrowed where the instruction that reads it does not keep it; get_field, put_field and get_var check a shape and read a slot; a call to a bytecode function whose target was seen once skips the generic entry. Generators, async functions and finally stay interpreted. Where the time is on js-p5 (docs/reports/zinc-next-perf.md, 2026-10-12): script 17.2 ms a frame, the interpreter loop 57% and QuickJS's runtime 43% of the samples (property definition, object creation, malloc and free), WebGL calls 1.6 ms. Workloads: bench/qjs (three, sprite, objects, physics, p5shape).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 three and matter-js frames of bench/qjs at least 2x faster than the interpreter with their hot functions compiled, the same outputs; sprite, objects and p5shape measured
- [ ] #2 examples/js-p5 unchanged draws at 60 fps on the development Mac (frame work p50 at most 12 ms, 16 to 19 today); what is left in QuickJS's runtime is named with its share
- [ ] #3 the test262 subset and the QuickJS T1 tests give the same results with the compiled functions bound
- [ ] #4 code size against the bytecode reported; a go or no-go recorded against D110 with what the next level (number types behind guards, object creation) would need
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, from D110. The compiler is the front half of the JIT the owner asked for: keep the lowering (bytecode to values, caches, guards) apart from the C emitter, so a machine-code backend can follow on desktop. Longbridge's quickjs-jit 0.12.11 (github.com/longbridge/rquickjs, MIT, Cranelift) is the prior art to read first: 32 to 45x on numeric kernels, 0.99 to 1.00x on its realistic panel, because 124 of about 255 opcodes are refused (closure variables, push_this, typeof, for_of, try) and every call returns through JS_CallInternal (its docs/PERFORMANCE_ROADMAP_V8_BUN.md): cover closures, this and calls before numeric speculation, p5 and three are made of them. Runtime fast paths the js-p5 samples point at, as patches of the queue, measured one by one: the copy of a plain object (Object.assign and spread: JS_DefineProperty, JS_CreateProperty, add_shape_property), Array.prototype.every and slice on fast arrays, malloc and free of short-lived arrays.
Review 2026-10-25: split into subtasks (Lowering of QuickJS bytecode to values with operand stack and locals in C variables, kept apart from the emitter; C emitter for numeric functions with direct calls, gate against bench/qjs three and matter-js; Closures and per-site property caches; Wire into examples/js-p5, test262 subset and QuickJS T1, go/no-go record against D110). D110 compiler for QuickJS bytecode: valuable for the owner JS-library speed ask but too large for a session and to be preceded by the ZN-724 measure. Split.
<!-- SECTION:NOTES:END -->
