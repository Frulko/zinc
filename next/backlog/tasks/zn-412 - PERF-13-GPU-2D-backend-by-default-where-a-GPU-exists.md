---
id: ZN-412
title: PERF-13 GPU 2D backend by default where a GPU exists
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 13:45'
labels:
  - perf
  - size-L
milestone: m-21
dependencies: []
priority: high
ordinal: 5120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The desktop window and the Pi KMS path rasterize on the CPU (200k quads: 41 ms on 8 cores). plugins/display-gl implements phase 1 of docs/reports/gpu-renderer-design.md. Make the GL backend the default renderer when a GL context exists, with the software raster as oracle and fallback under the tolerance policy of ui-rendering-architecture.md 4.17.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bouncing-ball 200k on the GL backend: GPU frame <= 2 ms on the M1, CPU raster 0
- [x] #2 hero and navigation within the agreed tolerance against the software goldens
- [ ] #3 Pi 3 measured on the rig
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Closed through its subtasks:
- AC1, ZN-412.01, .05 and .02.
  - bouncing-ball 200k on the GL replay: 0.66 ms of GPU by timer query, 1.77 ms of CPU submission.
  - The macOS window replays the command lists by default (ZINC_RENDERER=auto). A sample of the main thread shows no zrt::raster::render: CPU raster 0.
  - 119 fps without vsync against 94 on the software raster.
- AC2, ZN-412.03. The shader blends like the raster.
  - hero: mae 0.16, 0.11% of pixels over 24.
  - navigation: mae 0.56, 0.44%.
  - Both are in tests/t1/gl_renderer.sh.
- Fix after review (90bca0d1): display-gl now renders at the window's Retina density and zoom (HalDisplay.pixel_scale). Before, its windows were stretched from 1x and opened at zoom 3.

Left, as subtasks:
- AC3, Pi 3 on the rig: ZN-412.04, parked (hardware).
- Linux GL window: ZN-412.06.
<!-- SECTION:NOTES:END -->
