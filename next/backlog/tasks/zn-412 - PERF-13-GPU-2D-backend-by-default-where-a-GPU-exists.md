---
id: ZN-412
title: PERF-13 GPU 2D backend by default where a GPU exists
status: In Progress
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 12:25'
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
- [ ] #1 bouncing-ball 200k on the GL backend: GPU frame <= 2 ms on the M1, CPU raster 0
- [ ] #2 hero and navigation within the agreed tolerance against the software goldens
- [ ] #3 Pi 3 measured on the rig
<!-- AC:END -->
