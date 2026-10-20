---
id: ZN-119
title: glTF and OBJ loading with cgltf and meshoptimizer
status: Done
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-07 11:40'
labels:
  - rendering
  - size-S
milestone: m-8
dependencies:
  - ZN-107
ordinal: 40610
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor cgltf 1.15 (MIT) and meshoptimizer 1.3 (MIT) for the 3D plugins: glTF/GLB parsing, vertex cache and quantisation options; OBJ stays the prototype's loader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 three/gltf-viewer loads its model; vertex counts and bounding box equal the prototype's
- [x] #2 licence and checksum rows added
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. cgltf 1.15 and meshoptimizer 1.3 vendored (licence, version, sha256 rows), decision D25 keeps the prototype's reader; tests/native/gltf_check.cpp + tests/t0/gltf.sh diff meshes, triangles (unique and drawn), vertices and world bbox between cgltf and the three plugin's loader on both models: equal; the viewer prints the prototype's 'loaded CesiumMilkTruck.glb: 5 meshes, 2856 triangles'. Found and fixed an engine bug: plugin module paths spelled two ways (next/../plugins vs plugins) made 'three' and 'three/addons/..' two modules (src/frontend/modules.cpp normalises them). Not done: moving the three plugin onto cgltf, quantisation options in a profile.
<!-- SECTION:NOTES:END -->
