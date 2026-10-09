---
id: ZN-411
title: PERF-12 WebGL present without GPU readback
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 12:23'
labels:
  - perf
  - size-L
milestone: m-21
dependencies: []
priority: high
ordinal: 5110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/gl/webgl_js.cpp:387 zincPresent does glReadPixels of the whole canvas, main.cpp:489 glPresent flips and averages 2x2 on the CPU, then the software raster and the HAL upload it again; compositeClear does ~15 glGet per frame. webgl-cube (720x480 canvas): zincPresent is 47% of the main thread (glReadPixels 35%, of which 22% GPU sync; CPU downsample 11%). Compose the canvas texture on the GPU (shared context, or direct present when the canvas is the only content), MSAA or GPU blit downsample; interim: double PBO async readback plus GPU downsample; shadow state for compositeClear.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zincPresent <= 5% of the main thread on webgl-cube (sample)
- [x] #2 WebGL conformance runs (tools/webgl-conformance) unchanged
- [x] #3 webgl-surface and webgl-cube goldens pass within their tolerance
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (D48):
- src/gl/offscreen: readScaledAsync() blits the canvas down 1x or 2x, flipped (LINEAR for the 2x average), and reads it into a PBO without waiting; finishRead() maps it and writes 0x00RRGGBB into the image. The script's GL state (framebuffers, renderbuffer, pack state and buffer, scissor, rasterizer discard) is restored.
- src/gl/webgl_js: zincPresent pipelines the reads. A read started in frame N is shown in frame N+1, by the next present or by the host's frame-end hook (zn::host::onFrameEnd, new, called before end_frame), so a canvas drawn on demand still shows.
- Deterministic runs read synchronously (ZINC_GL_PRESENT=sync|async overrides). GLES2 and 3x/4x keep the CPU average, now inside the module.
- The present hook between zinc and the module is now a struct (size, pixels, done, atFrameEnd): the module writes straight into the runtime image's pixels.

Measured on webgl-cube in a window (Retina, 1440x960 canvas, sample of the main thread):
- zincPresent 79.1% -> 2.8% (AC1).
- The main thread now sleeps 64% of the time in the 125 fps pacing.
- With ZINC_FRAMEHASH on: 65 fps synchronous, 80 fps pipelined.
- Synchronous read after the GPU downsampling, measured on the way: 62% of the main thread (GPU wait 32%, driver detiling 21%), hence the pipelining.

Not done: shadow state for compositeClear (0% in the samples).

Tests: tests/t1/webgl_conformance passes (AC2); webgl_surface passes with its exact hash and webgl_gizmo with the webgl-cube golden (AC3); new tests/t1/webgl_present.sh (async frames match the sync frames one frame earlier, and a lone present shows at the next frame end); webgl_js, webgl_studio, three_3d, webgl2_js, webgl1_core, webgl2_tex and three pass; tests/run --changed 24 passed.
<!-- SECTION:NOTES:END -->
