---
id: ZN-596
title: >-
  Typed fast native calls and borrowed buffer accessors for QuickJS (patch +
  upstream PR)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 09:28'
updated_date: '2026-11-09 08:31'
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
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Drop AC4 (upstream PR); keep AC1-3 with a boundary micro-bench and conformance unchanged.

Measured in the report (M1 Pro harness): a generic C method with 4 doubles costs 40-45 ns over the empty loop, 28 ns through a typed fast path taken straight from OP_call_method (no JS_CallInternal, no stack frame, no JS_ToFloat64 calls); 1 int 27 -> 21 ns; int + Float32Array 32-34 -> 25-26 ns. Add to the patch queue: (1) a JS_CFUNC_fast prototype with a signature descriptor (f64, i32, u32, bool, borrowed typed-array pointer+length, opaque of `this` by class id), falling back to the generic function whenever a tag does not match; fast functions may not allocate, throw or re-enter JS; (2) JS_GetTypedArrayData (borrowed pointer, length, element size, no throw, no dup: 33-36 ns path vs 39-43 with the public checks) and a borrowed fast-array accessor for plain Arrays of numbers (what accelerators need). Bind the runtime table's host rows (letters d, i, u, b) and the hot WebGL entry points (uniform*, bind*, enable/disable, vertexAttribPointer, drawArrays/drawElements, viewport) as fast functions, generated from their signatures. Open an upstream PR to quickjs-ng for (1) and (2). (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a bench micro-benchmark (the report's boundary.js shape) shows 4-double calls <= 30 ns and int calls <= 22 ns over the empty loop on the M1 Pro (today 40-45 and 27-29)
- [ ] #2 __host_* rows with only d/i/u/b letters are fast functions; a zinc:gfx host call from QuickJS costs <= 40 ns raw (today ~150 ns, ~35 after ZN-567's stack arrays)
- [ ] #3 WebGL conformance unchanged (695 of 787 or better); fallback path covered by a test that passes strings, objects and detached buffers
- [ ] #4 upstream PR opened on quickjs-ng (link in the patch header)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Useful speed-up of the host boundary; the upstream PR is the owner's outward step. Evidence: third_party/quickjs-ng/patches has 0001-0003, no fast-call patch

2026-11-09 (worktree agent): implemented, left in Review for a quiet-machine number, the WebGL conformance milestone run and the owner's upstream PR. What: third_party/quickjs-ng/patches/0004-fast-calls.patch: JS_NewCFunctionFast + JSCFunctionFastDef (argument kinds JS_FAST_F64/I32/U32/BOOL/BUFFER, return VOID/F64/I32/U32/BOOL, optional this class whose opaque is passed, the generic function as fallback), a JS_CFUNC_fast prototype taken straight from OP_call (call0-3, tail_call) and OP_call_method when every tag matches (js_call_fast, no frame, no conversion calls; JS_UNINITIALIZED tells the interpreter to make the generic call), the generic function for everything else (js_call_c_function case); JS_GetBufferData (borrowed bytes of an ArrayBuffer, SharedArrayBuffer, typed array or DataView, -1 when detached or out of bounds, no throw) and JS_GetFastArray (the values of a dense Array, for ZN-597). Compiles clean with -Wall -Wextra and with CONFIG_CHECK_JSVALUE; tools/quickjs-patches check ok (v0.17.0 + 4). src/qjs/qjs.cpp: the __host_* rows whose letters are only d/i/u/b (returns n/d/i/b) are fast functions (hostFast, one JSCFunctionFastDef per row made once), except HostSysExit and the rows that flush the output or wait on the loop (flushesOutBefore), and never in a zinc:worker context (hostFn refuses the drawing rows there); 367 of 599 host rows qualify. hostFast builds only the row's HostArgs (16 zeroed ones cost ~3 ns). Tests: tests/t0/qjs_fastcall.sh builds tests/native/qjs_fastcall.c against the vendored engine (fast path counts for numbers, ToInt32/ToUint32 wraps, a loop, a tail call, each buffer kind, a method of the right class; the generic path for strings, valueOf objects, null/undefined, NaN/Infinity, a symbol (TypeError), too few arguments, call/apply, a detached typed array and DataView, an out-of-bounds view of a resized buffer, a string or an array for a buffer, a declining fast function, a wrong or missing this; not a constructor) and runs __host_gfxEase/__host_gfxWidth with strings, objects, null, call/apply through zinc --engine quickjs (same results as the fast path). Short runs: examples/breakout --engine quickjs headless, 30 frames, shot looks right; qjs, quickjs_patches, webgl_module, qjs_binding_rules T0 pass. Numbers (indicative: other trees building, the whole machine ~25% slower than at 08:45, empty loop 23 ns instead of 18), bench/qjs_boundary, ns over the empty loop, pristine vs patched engine built alike and alternated: vec4 method 49.3 -> 40.4 (direct generic vs fast), int method 34.0 -> 31.0, int + Float32Array 50.5 -> 39.7, 4-double global 43.0 -> 33.9; generic rows unchanged (nop 26.1/26.5, uniform4f thunk 58.2/58.2). Engine host rows (host.js, old develop build vs this one, back to back): __host_gfxWidth() 53 -> 26-27, __host_gfxEase(i, d) 64 -> 40, __host_gfxSetTransform(6 d) 72 -> 43 (inside tools/bench later: 34/51/54, same load). Profile (sample) of a vec4F loop: 85% in JS_CallInternal (the loop, the 600-property lookup), js_call_fast 10%, the callee 4%: the typed path is no longer the cost; the report's prototype passed typed C arguments in registers per kind (28 ns for 4 doubles), this generic descriptor costs a few ns more and serves any signature. AC1: not ticked: 40.4 and 31.0 here, about 32 and 24 scaled to a quiet machine, against <= 30 and <= 22. Owner's quiet run: bench/qjs_boundary/run (look at harness/vec4_fast and harness/int_fast; 25 s). AC2: the rows are fast functions; __host_gfxWidth 26-34 ns clears <= 40, a row with 6 doubles 43-54 does not: not ticked. Quiet run: ZINC_HEADLESS=1 build/zinc run bench/qjs_boundary/host.js --engine quickjs. AC3: the fallback test is written and passes; WebGL conformance is a milestone run (tests/t1/webgl_conformance.sh, 695 of 787 or better): not run, not ticked. libzn_webgl still binds through Node-API (napi_*), so its entry points cannot become JS_CFUNC_fast without an N-API extension: see later.md line. AC4: the owner's step. The patch applies cleanly to quickjs-ng master of 2026-11-09 (patch --dry-run). The commands, the PR text and an api-test.c test (compiled and passing against the patched engine) are in docs/reports/quickjs-fast-calls-upstream.md; the PR: gh pr create --repo quickjs-ng/quickjs --base master --title 'Add typed fast C functions (JS_NewCFunctionFast) and borrowed buffer accessors' --body-file pr.md. Web search (sonnet sub-agent): V8 fast API (CFunction/CTypeInfo, FastApiCallbackOptions.fallback, no JS/allocation/throw) https://v8docs.nodesource.com/node-24.1/d6/d0e/v8-fast-api-calls_8h_source.html https://docs.rs/v8/0.89.0/v8/fast_api/index.html ; Dart FFI isLeaf https://dart.googlesource.com/sdk/+/refs/heads/beta/sdk/lib/ffi/ffi.dart ; Deno op2(fast) https://docs.rs/deno_core/latest/deno_core/attr.op2.html ; SpiderMonkey: a detached typed array has length 0, a non-zero length check covers the detach check https://bugzilla.mozilla.org/show_bug.cgi?id=1381469 ; quickjs-ng master has no fast-call kind and no borrowed typed-array accessor, only JS_CFUNC_f_f/f_f_f; JS_GetUint8Array throws on a non-Uint8Array https://raw.githubusercontent.com/quickjs-ng/quickjs/master/quickjs.h ; JSTypedArrayEnum order differs from bellard/quickjs, API not frozen https://github.com/quickjs-ng/quickjs/pull/760 . Proposed decision: 'D-new: the QuickJS binding uses typed fast functions (patch 0004) for host calls of numbers and booleans; a fast function never allocates, throws or calls JS and falls back to its generic twin; Node-API bindings (libzn_webgl, plugins) stay generic until an N-API fast-call extension is worth it.' later.md: '- ZN-596: libzn_webgl binds through Node-API, so its hot entry points (uniform*, bind*, enable/disable, vertexAttribPointer, draw*, viewport) cannot be JS_CFUNC_fast: a zinc-only napi extension (napi_create_fast_function with a JSCFunctionFastDef) would give WebGL the same 15-20%'; '- ZN-596: per-kind specialised fast paths (4 doubles, 1 int) in js_call_fast would reach the report prototype's 28/21 ns if the generic descriptor stays above AC1 on a quiet machine'. Proposed tests: bench/qjs_boundary/run on a quiet M1 Pro (AC1, AC2; 25 s, <100 MB); tests/t1/webgl_conformance.sh (AC3; minutes, <1 GB); the test262 subset on the patched engine (tests/run --tier t2 --only compat, the README's rule for an engine change; minutes); tests/t1/quickjs.sh (seconds).
<!-- SECTION:NOTES:END -->
