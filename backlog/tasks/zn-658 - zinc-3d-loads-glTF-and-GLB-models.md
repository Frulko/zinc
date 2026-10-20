---
id: ZN-658
title: 'zinc:3d loads glTF and GLB models'
status: Done
assignee: []
created_date: '2026-10-10 18:17'
updated_date: '2026-10-10 19:15'
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
- [x] #1 a GLB with two meshes, a texture and a node hierarchy renders the same frame as its OBJ export within tolerance (golden)
- [x] #2 an unsupported feature (skinning, KHR extensions) is reported by name, not ignored silently
- [x] #3 a program that does not call it is byte-size unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: `loadGltf(asset)` in a module of its own, `zinc:3d/gltf` (plugins/3d/gltf.ts, alias in plugins/3d/plugin.json), through the three plugin's native glTF reader instead of cgltf (decision D72: natives link whole, so a separate module keeps other 3D programs byte-identical; one reader to keep right, cgltf stays the cross-check). Default scene, node hierarchy (TRS or matrix, decomposed), triangles/strips/fans, normals (none: flat), uvs, vertex colours, base colour + texture (embedded decoded, asset files baked), doubleSided, unlit; primitives over 65535 vertices split into several meshes. three's spec gained `extensions(h)` (extensionsUsed; host, sim). AC1: tests/t1/zinc3d_gltf.sh, model.glb (make_model.py: two meshes, embedded PNG, three nodes, TRS + matrix) vs its OBJ export: 0 pixels over 24 (max diff 1), golden tests/golden/zinc3d-gltf/frame.png on the interpreter and compiled. AC2: warning 'not supported, ignored: animations (1), skins (1), KHR_texture_transform'; a required KHR_draco_mesh_compression is the error 'required extension KHR_draco_mesh_compression is not supported'. AC3: tests/data/zinc3d_aa built before and after: 3028560 bytes, same SHA-1 17a56700; a program importing zinc:3d/gltf is 3227232 (+194 KB); the test checks the reader's strings are absent from the former. Also a 90601-vertex grid with 32-bit indices loads as 2 meshes, 180000 triangles. three_3d: gltf-viewer and conformance pass, only the known 3d/model and three/cubes diffs remain. Not done: the reader refuses a required KHR_mesh_quantization though it reads normalized attributes, and EXT_meshopt_compression: both belong to the gltfpack pipeline (ZN-441). The three plugin has no esp32 target, so zinc:3d/gltf is not on esp32. usage: n/a
<!-- SECTION:NOTES:END -->
