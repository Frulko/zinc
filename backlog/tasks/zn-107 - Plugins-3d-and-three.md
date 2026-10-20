---
id: ZN-107
title: 'Plugins: 3d and three'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:19'
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
- [x] #1 conformance scene3d.ts and three.ts pass (f64 and fx12 goldens where they exist)
- [x] #2 examples/3d/{cubes,model} and three/* render and match a stored PNG within the tolerance
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. scene3d.ts and three.ts conformance pass natively (the f32/fx12/size goldens equal the base ones); 3d/cubes, 3d/model, three/cubes and three/gltf-viewer render real scenes (frames checked) and match engine goldens (tests/golden/examples/*-30.png, 0 differing pixels across runs; the old toolchain had none). Needed: ABI letter U, out-array write-back in thunks and engine, bare plugin specifiers (three and its addons) resolved from the manifest, addon sources made Zinc-typed (Infinity fields, empty array, narrowing), lowering fix for inherited constructor defaults (regression golden ctor_inherited_default). cgltf/meshoptimizer not vendored: three.host.cpp has its own glTF code. Both plugins deterministic.
<!-- SECTION:NOTES:END -->
