---
id: ZN-105
title: 'Plugin: canvas2d'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:00'
labels:
  - plugins
  - size-S
milestone: m-9
dependencies:
  - ZN-101
ordinal: 40470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Link plugins/canvas2d natives against the host library's zrt_raster (one runtime owner), stb_image gains JPEG, ZRT_POINT_POOL defines from plugin.json.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 conformance canvas2d.ts passes (all three profile goldens where they exist)
- [x] #2 examples/canvas/sketch runs headless
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. canvas2d.host.cpp runs natively through the thunk (spec number[] mapped to f64[]), one rasterizer owner (the host library), ZRT_POINT_POOL from plugin.json; plugin marked deterministic so golden runs use it; conformance canvas2d.ts passes interpreted and AOT (the f32/fx12/1280x720/1620x2160 goldens are byte-identical to the base one); examples/canvas/sketch headless OK (frame checked). JPEG: src/res bakes .jpg/.jpeg via stb_image (PNG+JPEG only), tests/t0/res_jpeg.sh.
<!-- SECTION:NOTES:END -->
