---
id: ZN-411
title: PERF-12 WebGL present without GPU readback
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
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
- [ ] #1 zincPresent <= 5% of the main thread on webgl-cube (sample)
- [ ] #2 WebGL conformance runs (tools/webgl-conformance) unchanged
- [ ] #3 webgl-surface and webgl-cube goldens pass within their tolerance
<!-- AC:END -->
