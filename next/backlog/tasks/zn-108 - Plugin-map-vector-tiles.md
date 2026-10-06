---
id: ZN-108
title: 'Plugin: map (vector tiles)'
status: Backlog
assignee: []
created_date: '2026-10-06 22:56'
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
- [ ] #1 examples/maps/explorer and maps/navigation render tiles/ offline and match the stored PNG within the tolerance
- [ ] #2 pan/zoom frame time recorded in docs/reports/zinc-next-profiling.md (target: the prototype's)
<!-- AC:END -->
