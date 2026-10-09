---
id: ZN-562
title: 'zinc:gl: WebGL and GLES for compiled Zinc code, without QuickJS'
status: Backlog
assignee: []
created_date: '2026-10-09 07:59'
updated_date: '2026-10-09 07:59'
labels:
  - perf
  - 3d
  - webgl
milestone: m-21
dependencies: []
priority: high
ordinal: 341270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today WebGL (libzn_webgl, src/gl) is reachable only from QuickJS contexts (zinc:script): AOT TypeScript cannot draw on the GPU. Expose the WebGL1/2 API as a Zinc module (typed TS declarations: WebGLRenderingContext / WebGL2RenderingContext methods, typed arrays, enums) whose calls go straight to libzn_webgl's C++ entry points (no JS engine, no per-call boxing), with the same validation and the same GLES2/GLES3 tiers; the canvas is a Surface or the window itself (no glReadPixels present, see ZN-411). Owner question 2026-10-09: three.js and WebGL should be native AOT, not only interpreted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Zinc TS program compiled with zinc build draws a textured, lit cube through zinc:gl on macOS (GL 3.3 core / GLES3) and on GLES2 under the vc4 profile
- [ ] #2 WebGL1 conformance pages run against the zinc:gl entry points give the same results as through QuickJS
- [ ] #3 Per-call overhead measured against the QuickJS binding (microbenchmark of drawElements + uniform updates) and recorded
- [ ] #4 Interpreter and AOT builds of the example produce the same frame hash
<!-- AC:END -->
