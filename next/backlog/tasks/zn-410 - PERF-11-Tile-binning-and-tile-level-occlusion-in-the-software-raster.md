---
id: ZN-410
title: PERF-11 Tile binning and tile-level occlusion in the software raster
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-400
  - ZN-401
priority: high
ordinal: 5100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
raster.cpp:516 render walks every command per band and paints every overdraw layer: 200k scene 60-65 ms on one core for 144.8 M pixel writes (118x overdraw). Harness with the same pixel hash: 16 px tiles, each starting at the last opaque command covering it whole: 7.3 ms on 1 thread, 6.0 ms on 8 (single-threaded binning 6.9 ms is then the bottleneck: parallelize it). Bin effective bounds (clip stack applied), replay CLIP/UNCLIP and rounded-clip corners per tile, per-tile context instead of ZRT_TLS scratch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 200k scene <= 10 ms on 1 thread at 1280x960 (baseline 65 ms)
- [ ] #2 render corpus (tools/bench-render) no case slower, pixel hashes identical
- [ ] #3 pixel goldens identical
<!-- AC:END -->
