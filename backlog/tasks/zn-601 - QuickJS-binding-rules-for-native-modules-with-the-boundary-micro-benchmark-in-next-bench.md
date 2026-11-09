---
id: ZN-601
title: >-
  QuickJS binding rules for native modules, with the boundary micro-benchmark in
  bench
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 09:29'
updated_date: '2026-11-09 08:13'
labels:
  - perf
  - quickjs
  - docs
  - size-S
milestone: m-21
dependencies:
  - ZN-567
priority: medium
ordinal: 12800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write down what the report measured so plugin and WebGL code stops paying hidden costs: never use an exception as a type test (1.3-2.3 us, growing ~42 ns per JS frame of depth); no heap allocation per call (two std::vector reserves cost ~110 ns); atoms created once (JS_NewAtom), never JS_SetPropertyStr in hot paths; results as numbers or written into a shared typed array, not new objects (150-185 ns per {x,y,z}); coarse-grained calls over per-element calls; no JS-side command buffers on QuickJS (300-430 ns per recorded command vs 45 ns for the direct call); JS_Call from native ~14 ns. Add the harness's boundary.js as bench/qjs_boundary with a T2 regression gate. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a section 'Binding to QuickJS' in docs/plugins.md (or the native ABI doc) with the rules and the numbers
- [x] #2 bench/qjs_boundary runs in tools/bench and fails when a listed call regresses by more than 30%
- [x] #3 libzn_webgl and src/qjs pass the rules (grep checks for JS_GetArrayBuffer-then-throw and per-call std::vector in thunks)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent). What: docs/plugins.md 'Binding to QuickJS' (the seven rules with the report's numbers and the bench's); bench/qjs_boundary (harness.c: a bare QuickJS host with the report's fake GL class, ported to C from the report's harness.cpp; boundary.js: 27 rows, 'BENCH <id> <ns>'; host.js: the engine's zinc:gfx host rows __host_gfxWidth, __host_gfxEase, __host_gfxSetTransform from zinc run --engine quickjs; run: builds the harness with cc -O2 from third_party/quickjs-ng like tools/bench-bridge floor, then tools/bench --gate); tools/bench --gate BASELINE [--write-baseline]: the median over the runs of each 'BENCH id value' line a command prints, exit 3 when a case of baseline.json is more than max_regress_pct (30) slower or missing; baseline.json lists 24 calls (the anti-pattern rows are printed, not gated). Rules check tests/t0/qjs_binding_rules.sh (tests/data/qjs_binding_rules.py): rule 1, a throwing buffer accessor (JS_GetArrayBuffer, JS_GetUint8Array, napi_get_arraybuffer_info/typedarray_info/dataview_info) only after its non-throwing type test within 5 lines; rule 2, no std::vector in hostFn, callThunk and the hot WebGL methods (uniform*, bind*, enable/disable, vertexAttribPointer, draw*, viewport) except lines marked '// slow path'; it fails when a listed hot function is not found, and the test proves the checker and the gate on fixed inputs. Fixes the check found: webgl_js.cpp uniformFv/uniformIv/uniformMat/uniformMatrix4fv/matRC/attribF copied every view into a std::vector: now Elems<T>/elemsOf read an aligned view in place (copy only for a plain array or an unaligned view); qjs.cpp hostFn built 16 strings and 16 vectors per call: now one std::optional<HostScratch> built only by rows with s/D/B/U letters. Numbers (indicative, M1 Pro, load 4-9 with another tree building): harness nop thunk 21.7 ns, int 29.3, uniform4f thunk 46.0, vec4 direct 39.1, uniform4fv view 39.3, throw as type test 1367 (2422 twenty frames deeper), ret {x,y,z} 163 (str) / 141 (atoms), shared F32 71, JS command buffer 303, host rows gfxWidth 52.9, gfxEase 63.9, gfxSetTransform(6d) 72.5; bench/webgl_binding.js uniform4fv(Float32Array) 147 -> 116 ns with the in-place read (same load, old and new build back to back). The report's 'two std::vector reserves ~110 ns' did not reproduce in the C shape (two malloc/free of 288 B: ~0 ns on macOS's allocator): the doc quotes the report's number as measured then. Web search (sonnet sub-agent): V8 Fast API rules (no JS, no heap allocation, no throw; options.fallback re-runs the slow path) https://sources.debian.org/src/nodejs/20.19.2%2Bdfsg-1/doc/contributing/adding-v8-fast-api.md ; Dart FFI leaf calls (no callback, no handles) https://dart.googlesource.com/sdk/+/refs/heads/beta/sdk/lib/ffi/ffi.dart ; Deno op2(fast) https://docs.rs/deno_core/latest/deno_core/attr.op2.html ; gating: median of repetitions, CV > 25% unreliable (Google Benchmark compare.py) https://mew.readthedocs.io/en/latest/guide/trusting-results.html , threshold above same-commit spread https://codspeed.io/blog/benchmarks-in-ci-without-noise ; borrowed pointers must not outlive the call (detach) https://www.callstack.com/blog/memory-ownership-models-when-javascript-meets-native-code . later.md: '- ZN-601: tools/bench --gate prints a coefficient of variation per case and marks a case above 25% unreliable instead of failing it, so a noisy run says so (Google Benchmark compare.py does)'. Proposed tests: bench/qjs_boundary/run --write-baseline then bench/qjs_boundary/run on a quiet M1 Pro (baseline taken at load 4, about 25 s, <100 MB); tests/t1/webgl_js.sh and tests/t1/webgl_conformance.sh (uniform paths now read views in place; 1-3 min, <500 MB).
<!-- SECTION:NOTES:END -->
