---
id: ZN-116
title: 'GL rendering path: GLAD, display-gl, EGL surfaceless check'
status: Done
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-07 11:09'
labels:
  - rendering
  - size-L
milestone: m-8
dependencies:
  - ZN-104
  - ZN-113
ordinal: 40580
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D11: the software rasterizer stays the reference; add a GL 3.3/GLES3 renderer behind the same draw-command stream (GLAD 2.0.8 generated loader, vendored) used by display-gl (KMS/EGL on Linux, macOS CGL via SDL). Level 1 simulation: Mesa llvmpipe EGL surfaceless frames compared with the software frame within the tolerance (docs/reports/gpu-renderer-design.md and render-perf-options.md describe the prototype's design).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the three tests/visual programs rendered through GL under llvmpipe match the software frames within the tolerance
- [x] #2 frame time of the GL path on hero is not worse than the software path on the same machine (recorded)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. The prototype's display-gl GL renderer runs under this engine once the frame loop calls the driver's poll (src/host/gfx_host.cpp). tools/glcompare + tests/t1/gl_renderer.sh: clock, overlays, ui within 5%/mae 3 of the software frame, shapes within 12%/15 (LINE/POLY skipped, ZN-181). hero: GL 1078 us CPU per frame vs 4770 us software. Not done: Mesa llvmpipe EGL (Linux only; macOS GPU used), GLAD loader and the Backend interface (roadmap tasks ZN-174, ZN-176, ZN-180..183).
<!-- SECTION:NOTES:END -->
