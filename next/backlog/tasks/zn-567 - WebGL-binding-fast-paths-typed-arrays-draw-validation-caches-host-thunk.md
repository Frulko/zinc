---
id: ZN-567
title: 'WebGL binding fast paths (typed arrays, draw validation caches, host thunk)'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-565
ordinal: 346270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on the M1 Pro: uniform4fv(Float32Array) 1352 ns vs uniform4f 99 ns, bufferSubData(Float32Array) 1336 ns vs (ArrayBuffer) 114 ns, because bytesOf (src/gl/webgl_js.cpp:95) first calls JS_GetArrayBuffer on the view, which throws a TypeError (stack trace built) that is discarded. Detect typed arrays and ArrayBuffers without throwing (JS_GetTypedArrayType / JS_IsArrayBuffer). Also: cache per-program attribute tables at link time instead of glGetActiveAttrib + glGetAttribLocation per draw (checkDrawState), cache index ranges per element-buffer range instead of scanning indices each drawElements, use stack arrays in the QuickJS host thunk (src/qjs/qjs.cpp:87 reserves two vectors per call). The draw-validation caches also serve ZN-562 (zinc:gl). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 uniform4fv(Float32Array) <= 200 ns and bufferSubData(Float32Array) <= 250 ns on the M1 Pro (today 1352 and 1336 ns)
- [ ] #2 drawArrays overhead <= 250 ns (today 463 ns)
- [ ] #3 repeated drawElements of the same 60k-index range <= 3 us (today 19 us)
- [ ] #4 WebGL conformance unchanged; a micro-benchmark in next/bench
<!-- AC:END -->
