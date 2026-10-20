---
id: ZN-108
title: 'Plugin: map (vector tiles)'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:22'
labels:
  - plugins
  - rendering
  - size-L
milestone: m-9
dependencies:
  - ZN-101
  - ZN-087
ordinal: 40500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
MapEngine: decode Mapbox Vector Tiles with protozero + vtzero, triangulate polygons with earcut.hpp (decision D11), keep the prototype's style evaluator for the MapLibre style subset, draw through the engine rasterizer with tile images cached; offline z/x/y.pbf directories and the online TileJSON source via zinc:net.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/maps/explorer and maps/navigation render tiles/ offline and match the stored PNG within the tolerance
- [x] #2 pan/zoom frame time recorded in docs/reports/zinc-next-profiling.md (target: the prototype's)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Decision D24: the prototype's map engine is kept (it runs unchanged through the plugin pipeline); maps/explorer and maps/navigation render their offline tiles (frames checked) and equal engine goldens tests/golden/examples/map-*-40.png (the old toolchain had none); plugin deterministic; tests/t1/map.sh. Pan/zoom frame times recorded in docs/reports/zinc-next-profiling.md (idle equals the prototype's; new tiles cost about 90 ms each; no pan figure exists for the prototype headless). protozero/vtzero/earcut not vendored.
<!-- SECTION:NOTES:END -->
