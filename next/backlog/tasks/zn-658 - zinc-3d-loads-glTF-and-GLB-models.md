---
id: ZN-658
title: 'zinc:3d loads glTF and GLB models'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 18:17'
labels:
  - 3d
  - assets
  - size-M
milestone: m-27
dependencies: []
ordinal: 411410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answers, 2026-10-10, for the showcase demos of M27.) Museum scans and photogrammetry come as glTF/GLB; zinc:3d loads OBJ only. Load a glTF 2.0 or GLB file (meshes, node transforms, base colour and its texture, normals, vertex colours) through the vendored cgltf, as `loadGltf(asset)` beside `loadObj`, on the interpreter and the AOT. The larger import pipeline (gltfpack, meshopt, .zmesh) stays ZN-441.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a GLB with two meshes, a texture and a node hierarchy renders the same frame as its OBJ export within tolerance (golden)
- [ ] #2 an unsupported feature (skinning, KHR extensions) is reported by name, not ignored silently
- [ ] #3 a program that does not call it is byte-size unchanged
<!-- AC:END -->
