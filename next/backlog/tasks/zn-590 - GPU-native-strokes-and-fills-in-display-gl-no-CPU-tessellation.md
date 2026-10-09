---
id: ZN-590
title: GPU-native strokes and fills in display-gl (no CPU tessellation)
status: Backlog
assignee: []
created_date: '2026-10-09 09:14'
labels:
  - perf
  - gpu
milestone: m-21
dependencies:
  - ZN-412
priority: medium
ordinal: 369270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner question 2026-10-09 (ZN-406): delegate strokes to the GPU. Today display-gl rasterizes LINE/POLY on the CPU into cached coverage tiles (plugins/display-gl/src/gl_renderer.cpp draw_poly) and stroke_contours tessellates every stroke on the CPU at record time (runtime/gfx.cpp stroke). GPU path: keep the polyline (points, width, closed) in the command instead of contours when the backend is GPU; the vertex shader expands each segment into a quad, the fragment shader computes the capsule distance (round joins and caps, analytic AA); fills by stencil-then-cover or a cached triangulation (libtess2 or earcut, vendored). The software raster stays the path without a GPU and the oracle under the display-gl tolerance policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 navigation on display-gl: no stroke_contours and no CPU POLY tile rasterization per frame (counters), paint CPU time measured before/after
- [ ] #2 frames within the display-gl tolerance against the software goldens (hero, navigation, svg_lottie)
- [ ] #3 GLES2 (Pi 3, D29 prelude) and desktop GL paths; the software path and its goldens unchanged
<!-- AC:END -->
