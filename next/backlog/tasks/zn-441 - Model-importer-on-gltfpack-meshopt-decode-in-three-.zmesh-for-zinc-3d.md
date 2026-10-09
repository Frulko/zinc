---
id: ZN-441
title: 'Model importer on gltfpack; meshopt decode in three, .zmesh for zinc:3d'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-439
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build gltfpack from the vendored meshoptimizer 1.3 tag: quantisation, EXT_meshopt_compression, LODs; textures go through tex-basis. The three plugin decodes meshopt and quantised meshes with zn_meshopt. zinc:3d gets a .zmesh in its own vertex layout. Report: docs/reports/games/toolchain-assets-loading.md (4.6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CesiumMilkTruck sizes before and after are in the notes
- [ ] #2 the gltf-viewer frame is within tolerance
- [ ] #3 zinc:3d loads a .zmesh with no parsing step
<!-- AC:END -->
