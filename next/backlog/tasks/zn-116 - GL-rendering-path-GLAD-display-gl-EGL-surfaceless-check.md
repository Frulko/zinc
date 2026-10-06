---
id: ZN-116
title: 'GL rendering path: GLAD, display-gl, EGL surfaceless check'
status: Backlog
assignee: []
created_date: '2026-10-06 22:58'
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
- [ ] #1 the three tests/visual programs rendered through GL under llvmpipe match the software frames within the tolerance
- [ ] #2 frame time of the GL path on hero is not worse than the software path on the same machine (recorded)
<!-- AC:END -->
