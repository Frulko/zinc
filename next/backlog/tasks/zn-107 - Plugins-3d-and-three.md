---
id: ZN-107
title: 'Plugins: 3d and three'
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
  - ZN-062
  - ZN-076
ordinal: 40490
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port plugins/3d (render3d.host.cpp, 442 lines) and plugins/three (three.host.cpp, 489) onto the engine's image buffers through the plugin ABI; cgltf and meshoptimizer for glTF (decision D11: own scene graph, proven loaders). The three API surface under plugins/three/index.ts and the `three` alias via tsconfig paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 conformance scene3d.ts and three.ts pass (f64 and fx12 goldens where they exist)
- [ ] #2 examples/3d/{cubes,model} and three/* render and match a stored PNG within the tolerance
<!-- AC:END -->
