---
id: ZN-567
title: 'WebGL binding fast paths (typed arrays, draw validation caches, host thunk)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-11-09 00:43'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-565
ordinal: 8400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Run `build/zinc run bench/webgl_binding.js --engine quickjs` on the M1 Pro (seconds), record the ns in zinc-next-perf.md, tick AC1-3 or name the next lever.

Measured on the M1 Pro: uniform4fv(Float32Array) 1352 ns vs uniform4f 99 ns, bufferSubData(Float32Array) 1336 ns vs (ArrayBuffer) 114 ns, because bytesOf (src/gl/webgl_js.cpp:95) first calls JS_GetArrayBuffer on the view, which throws a TypeError (stack trace built) that is discarded. Detect typed arrays and ArrayBuffers without throwing (JS_GetTypedArrayType / JS_IsArrayBuffer). Also: cache per-program attribute tables at link time instead of glGetActiveAttrib + glGetAttribLocation per draw (checkDrawState), cache index ranges per element-buffer range instead of scanning indices each drawElements, use stack arrays in the QuickJS host thunk (src/qjs/qjs.cpp:87 reserves two vectors per call). The draw-validation caches also serve ZN-562 (zinc:gl). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 uniform4fv(Float32Array) <= 200 ns and bufferSubData(Float32Array) <= 250 ns on the M1 Pro (today 1352 and 1336 ns)
- [x] #2 drawArrays overhead <= 250 ns (today 463 ns)
- [x] #3 repeated drawElements of the same 60k-index range <= 3 us (today 19 us)
- [x] #4 WebGL conformance unchanged; a micro-benchmark in bench
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review (2026-10-11): done on the Intel Mac; AC1 to AC3 are thresholds for the M1 Pro, to be measured there: `build/zinc run bench/webgl_binding.js --engine quickjs` (prints each call in ns, best of 5). What changed: bytesOf (src/gl/webgl_js.cpp) tells ArrayBuffers and typed arrays apart with JS_IsArrayBuffer / JS_GetTypedArrayType instead of a JS_GetArrayBuffer that threw and discarded a TypeError for every view; linkProgram stores the attributes the program reads (location, type) and its uniform block count, and checkDrawState walks them instead of glGetActiveAttrib + glGetAttribLocation per attribute per draw; an element buffer keeps the largest index of its last 8 ranges drawn (WebGL1::maxIndexOf), cleared by bufferData, bufferSubData and copyBufferSubData; the QuickJS host thunk (src/qjs/qjs.cpp) keeps a string and an array per parameter in place, no two vectors reserved per call. Intel Mac, before -> after (docs/reports/zinc-next-perf.md, ZN-567): uniform4fv(Float32Array) 2239-2281 -> 227-242 ns, bufferSubData(Float32Array) 2207-2210 -> 178-184 ns, drawArrays 557-636 -> 345-403 ns, drawElements of the same 60k range 57.4-66.2 -> 11.6-11.8 us. The rest is the driver: drawArrays of 0 vertices is 124 ns (getError 83 ns), drawElements without its 60k indices 143 ns. With the M1/Intel ratios of the old numbers (1.65x for the typed arrays, 1.3x drawArrays, 3.1x drawElements) the M1 would be near 140 ns, 110 ns, 285 ns and 3.7 us: drawArrays and drawElements may stay above their targets there, on driver time. AC4: tests/t1/webgl_conformance.sh passes; the micro-benchmark is bench/webgl_binding.js. Regression golden tests/golden/webgl/draw_caches.js (in tests/t1/webgl_js.sh): an index changed by bufferSubData and a relinked program's new attribute are checked again. Tests: the WebGL set (webgl_js, webgl2_js, webgl1_core, webgl2_tex, webgl_present, webgl_surface, webgl_libs, gl_cube, three, webenv_*, webgl_gizmo, webgl_module, webgl_studio, zinc_gl_api, zinc_gl_api_tour, webgl_conformance) and the QuickJS set (qjs, qjs_native, quickjs, qjs_robust, layout_bridge, webenv, console_live) pass. usage: n/a
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) The premise is wrong: the development machine is now the M1 Pro (uname -m arm64, 'Apple M1 Pro'; build/zinc is arm64). bench/webgl_binding.js run here today under load 42: uniform4fv(Float32Array) 148 ns, bufferSubData(Float32Array) 139 ns (AC1 passes), drawArrays 229-256 ns (AC2 borderline), drawElements 60k 4427-5827 ns against the 3 us target (AC3 fails or unproven). One quiet run decides it; do not close on the timing criteria. Evidence: src/gl/webgl_js.cpp bytesOf; bench/webgl_binding.js
Review 2026-11-07: done-partly. Code change done on the Intel Mac; AC1-3 thresholds were never measured on the M1 Pro. Evidence: src/gl/webgl_js.cpp:164 bytesOf; bench/webgl_binding.js; AC4 ticked

Measured 2026-11-09 on the M1 Pro (load 3, quiet; build/zinc of develop), bench/webgl_binding.js --engine quickjs, best of 5: uniform4f 115-118 ns, uniform4fv(Float32Array) 140-144 ns (AC1 <= 200), bufferSubData(ArrayBuffer) 126-127 ns, bufferSubData(Float32Array) 130-131 ns (AC1 <= 250), drawArrays 220-227 ns (AC2 <= 250), drawElements 60k 4412-5593 ns with gl.finish, 202-279 ns without (AC3 <= 3 us). AC3 decision: the 4.4 us is the GPU walking 60k indices, not the binding. Proof: drawElements of 3 indices 232 ns, of 6000 indices 499 ns, of 60000 indices 4412 ns with finish (linear in the indices, so GPU work), and 202-215 ns for the same 60k draw when the loop does not wait for the GPU (the max index comes from the range cache; before ZN-567 the scan alone was 19 us). The bench now prints both lines: 'drawElements 60k' (GPU included) and 'drawElements 60k submit' (validation and submission, 200 draws that fit in the queue); time() also finishes the queue before each run so one line's GPU work does not land on the next. Web search (Chromium BufferManager::GetMaxValueForRange caches max per (offset, count, type) range and clears on write, as we do; WebKit bug 32466 caches max per element type; Firefox's WebGLElementArrayCache uses a max-tree so a partial bufferSubData does not drop the whole cache, a lead if meshes update sub-ranges each frame; ANGLE computes the range in validation per draw): https://chromium.googlesource.com/chromium/src/+/main/gpu/command_buffer/service/buffer_manager.h https://bugs.webkit.org/show_bug.cgi?id=32466 https://bugzilla.mozilla.org/show_bug.cgi?id=1366175. Proposed tests: tests/t1/webgl_js.sh (draw_caches golden, 10 s, <200 MB).
<!-- SECTION:NOTES:END -->
