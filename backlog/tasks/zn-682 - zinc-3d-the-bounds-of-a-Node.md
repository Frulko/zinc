---
id: ZN-682
title: 'zinc:3d: the bounds of a Node'
status: Done
assignee: []
created_date: '2026-10-10 19:36'
updated_date: '2026-11-09 04:20'
labels:
  - 3d
  - size-S
dependencies: []
ordinal: 9800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) A viewer has to frame an object: zinc:3d gives no bounding box or sphere of a node and its children.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bounds(node)` returns the box and the sphere of a subtree, with a test on a loaded OBJ and a GLB
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (parallel worktree, 2026-11-09). Test: tests/t0/zinc3d_bounds.sh (PASS, 2.5 s, interpreter, AOT --native and QuickJS).

What exists
- plugins/3d/index.ts: `Bounds` (min, max, center, radius, isEmpty(); empty = +Infinity/-Infinity/-1 as three.js), `Mesh.bounds` (computed once when the mesh is made: from the positions in TS, or for a .zmesh part by the native partBounds), `bounds(node)`.
- render3d.spec.ts `partBounds(data, at, out)`: in the C++ Engine (render3d.host.cpp, so every C++ backend: software, GL, PSP, 3DS, Vita, ESP32, rpi1, wasm), the sim stand-in and the web renderer. tests/data/native-gen-render3d-additions.txt records the new declaration for native_gen.
- examples/museum-table/src/viewer.ts frames its object with bounds(body): the OBJ text scan and the glTF accessor reading (which ignored the node transforms) are gone. The radius stays half the box diagonal, the unit of the format's view distances.

Decisions
- Space: the node's parent space (its own TRS applies, not its ancestors'): a Node has no parent link; for a node of the scene it is world space.
- Box: three.js Box3.setFromObject without precise: each mesh's cached local box through the node matrix (centre and absolute-matrix half extents, equal to the 8 corners). No vertex is read per call.
- Sphere: per mesh, about the box centre through the farthest vertex (three.js computeBoundingSphere); moved by the matrix, radius times the largest column scale (Sphere.applyMatrix4), merged as Sphere.union. Not Ritter or Welzl: a few percent tighter for a second pass and more code.
- Hidden nodes count (three.js). Skinned meshes (zinc:animation) count their bind pose; zinc:3d has no morph targets. No precise mode (YAGNI).

Proof
- T0 against tests/data/zinc3d_bounds/expected.py (Python over the files: OBJ vertices, GLB vertices from the binary chunk with 8-corner transforms): OBJ export, GLB (3-node hierarchy, TRS and matrix, scale 0.6), its .zmesh (flattened: equal to the OBJ), the GLB root turned, moved and scaled, an empty node. All within 2e-5.
- tests/run --only: zinc3d_bounds, zinc3d_config, zinc3d_sim, zinc3d_still, zinc3d_world, zinc3d_world_build, native_gen PASS. The sim stand-in gives the same OBJ and .zmesh bounds.
- Museum viewer: one headless run of 75 frames of tests/data/museum_viewer/session.input (--sequence porcelain --log): the 306 view-log lines equal expected.log and frame 75 hashes to the golden 77af7ceb0d2504de.

Research (sonnet sub-agent)
- three.js Box3.expandByObject / precise: https://raw.githubusercontent.com/mrdoob/three.js/dev/src/math/Box3.js
- BufferGeometry.computeBoundingBox (morph extents) and computeBoundingSphere: https://raw.githubusercontent.com/mrdoob/three.js/dev/src/core/BufferGeometry.js
- SkinnedMesh.computeBoundingBox (current pose, recomputed only when called): https://raw.githubusercontent.com/mrdoob/three.js/dev/src/objects/SkinnedMesh.js
- Sphere.applyMatrix4 / union: https://raw.githubusercontent.com/mrdoob/three.js/dev/src/math/Sphere.js
- Babylon BoundingInfo and getHierarchyBoundingVectors pitfalls: https://unpkg.com/@babylonjs/core@8.6.1/Culling/boundingInfo.d.ts, https://forum.babylonjs.com/t/boundingvectors-of-instanced-glb-mesh-hierarchy/26069
- Godot get_aabb (local, children ignored; merge global_transform * aabb): https://docs.godotengine.org/en/3.0/classes/class_visualinstance.html, https://forum.godotengine.org/t/get-height-of-characterbody3d-that-is-composed-of-multiple-meshes-dynamically/41241
- Ritter vs Welzl: https://www.johndcook.com/blog/2021/08/08/bounding-sphere/, https://help.agi.com/STKComponents/html/BlogBoundingSphere.htm

Proposed tests (museum, for the owner)
- tests/demo/museum_viewer.sh as it is: the full session and the three frame hashes, now through bounds(); about 20 s, under 1 GB.
- museum viewer with a GLB of placed parts (the Smithsonian vase GLB or a small multi-node GLB): the object centred in the box at the opening view; one run, about 5 s.
<!-- SECTION:NOTES:END -->
