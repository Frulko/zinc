---
id: ZN-441
title: 'Model importer on gltfpack; meshopt decode in three, .zmesh for zinc:3d'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 19:55'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-439
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build gltfpack from the vendored meshoptimizer 1.3 tag: quantisation, EXT_meshopt_compression, LODs; textures go through tex-basis. The three plugin decodes meshopt and quantised meshes with zn_meshopt. zinc:3d gets a .zmesh in its own vertex layout. Report: docs/reports/games/toolchain-assets-loading.md (4.6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CesiumMilkTruck sizes before and after are in the notes
- [x] #2 the gltf-viewer frame is within tolerance
- [x] #3 zinc:3d loads a .zmesh with no parsing step
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (parallel worktree, 2026-10-11). Every criterion passes on macOS (tests/t1/model.sh, 8 s).

What was built:
- gltfpack 1.3 as a pinned tool (src/tc: `zinc toolchain gltfpack`, `ZINC_GLTFPACK`, listed by `zinc doctor`): the meshoptimizer v1.3 archive, the one third_party/meshoptimizer vendors (sha256 ca4f47d4...), fetched once and built with the pinned zig without Basis or WebP (46 s here). basisu and gltfpack now share one source-tool builder (SourceTool, ensureSourceTool).
- The `model` importer (src/assets/model.cpp): embedded images (GLB views, data: URIs) go through the texture importer (`texture.*` options, `texture.format` from the target's profile like a texture rule; normal/occlusion/metal-roughness maps linear) and become image entries `<model>.<n>.<ext>` the model names by URI (gltfpack -tr). format glb (default, three): `gltfpack -cc -kn` (KHR_mesh_quantization + EXT_meshopt_compression, named nodes kept; `compress`, `keepNodes`, `gltfpack` extra args). format zmesh (zinc:3d): `gltfpack -noq`, then cgltf reads the output, flattens the default scene (world transforms, mirrored nodes turned over, KHR_texture_transform applied) and writes ZMS1 (include/zn/zmesh.h): parts of <= 65535 vertices in zinc:3d's own float layout. `simplify` (-si) and `lods` (an entry <stem>.lod<n>.<ext> each). The artifact is a ZAB1 bundle (directory then bytes): the pack takes each entry; report.json's row: format glb/zmesh, pack bytes of all its entries, GPU bytes of its textures (read from the directory, a cached artifact read in place). .gltf sources name their external buffers as deps.
- three plugin: decodes EXT_ and KHR_meshopt_compression views once per document with the meshopt decoder of third_party/meshoptimizer (vertexcodec, indexcodec, vertexfilter #included: plugin builds now add `-I <engine>/third_party` last; tools/package ships those files), checking the sizes the decoder only asserts; accepts KHR_mesh_quantization; applies KHR_texture_transform of the base colour texture to the uvs; a GLB buffer other than 0 without a URI has no data (meshopt fallback). zinc:3d's loadGltf reads them through the same reader.
- zinc:3d: `loadModel(asset)` and `Mesh(..., zmesh, at)`: native `meshLoad(data, at)` checks the part (fits, every index < vertices) and copies the arrays as they are (software renderer: its Mesh arrays; GPU renderer: one vertex buffer with an attribute range each, then the indices). No parsing step.

Criteria (tests/t1/model.sh):
- #1 CesiumMilkTruck.glb 369,980 B (geometry+JSON 151,001, JPEG 2048^2 218,979). After: GLB 30,560 B (release zstd 20,396); texture entry dev rgba8+mips 22,369,636 B / release bc1+mips 2,796,232 B (zstd 293,945); truck for three in a release pack 314,341 B, GPU 2,796,216 B instead of 22,369,620. zmesh 131,676 B (zstd 49,007), LOD 0.5 79,704 B (zstd 29,435, 1,946 of 3,624 triangles). Import 0.6 s dev, 6.7 s release (basisu BC1). Table in docs/reports/zinc-next-assets.md "Models".
- #2 "gltf-viewer frame 30, packed against original: pixels over 24: 0.033%, mae 0.044" (limits 1% / 1; software renderer, deterministic; the viewer's source unchanged, the packed run logs "loaded CesiumMilkTruck.glb: 5 meshes, 2856 triangles"). three reads the packed truck and box as cgltf reads the originals (tests/golden/gltf/stats.txt without the vertex count: 3,564 after welding against 4,823).
- #3 "zm/truck.zmesh: 3 meshes, 3624 triangles"; ".zmesh against the GLB: 0.021%, mae 0.082" (software), 0.083% / 0.104 on the GPU renderer (by hand, hidden window); "damaged parts refused: cut short true, index past the vertices true". Loads (interpreter, load 4.4): loadModel 244-263 ms first (the 22 MB dev texture), 8.6-8.8 ms with the texture made, of which readBytes 5.6-5.9 ms; loadGltf 102-110 ms, 62-64 ms again. Determinism: two builds in two directories, the second without the cache, give the same models.zpk.

Tests run: model (new), gltf, assets, project_assets, tc, three_3d, zinc3d_gltf (its warning case now names KHR_lights_punctual: KHR_texture_transform is read), zinc3d_glow, tilemap, sprite_atlas, splash, plugin_build, plugin_key, plugin_stamp, texture (window, load 3.9): all pass. tools/proto-capture compare: three/gltf-viewer and 3d/cubes exact; 3d/model (3 px) and three/cubes (5 px, max 1) differ with HEAD's plugin sources too (pre-existing, this machine). `tests/run --changed` falls back to the whole tier (cli_core, main, CMakeLists): not run.

Decision (for a decision record): gltfpack delivered as pinned sources built with the pinned zig like basisu (D108) 65, against vendoring gltf/ (540 KB) and shipping a second binary 56, linking gltfpack into zinc 48 (fit x3, perf x3, size x2, maint x2, licence x2, portab x1, effort x1). The meshopt decoder compiled into the three plugin from the engine's third_party through `-I third_party` 67, against a copy in plugins/three/vendor 60 and no compression for three 47 (zn_meshopt is a CMake library plugins cannot link). Textures leave the model for the texture importer (pre-extracted, gltfpack -tr) so they follow the profile; .zmesh keeps zinc:3d's float SoA layout so both renderers take it as is (the int16 layout of the design waits for a renderer that reads it).

Lines for later.md:
- ZN-441: zinc:assets readBytes (and fs.readBytes, utf8Encode, randomBytes) fill a u8[] with one host call per byte: 5.6 ms of the 8.6 ms geometry load of the truck's 131 KB .zmesh, 17 ms for its 370 KB GLB; a runtime call that copies the entry into the array at once would make a .zmesh load a memcpy.
- ZN-441: dev builds make a model's textures rgba8 as texture rules (D108): the truck's 219 KB JPEG becomes a 22 MB entry and the first loadModel takes 244 ms (reading and checking the entry, cause not measured: D89's SHA-256 is a suspect) against 102 ms for loadGltf decoding the JPEG; keep dev model textures as their source image, or measure the entry read.
- ZN-441: .zmesh keeps zinc:3d's float layout (24 B a vertex plus uvs and colours); int16 positions with a scale and packed normals (design 4.6) would halve it on the Pi 1, PSP and 3DS once the software renderer reads them.
- ZN-441: .zmesh flattens the scene: a program that moves a named part (the truck's wheels) needs a node table in ZMS1.
- ZN-441: the sim target's three stand-in (three.sim.ts) refuses gltfpack's output (KHR_mesh_quantization and EXT_meshopt_compression are required).
- ZN-441: plugin keys and stamps do not cover the engine's third_party files a plugin includes (three: meshoptimizer's decoder): a meshoptimizer upgrade needs the key bumped by hand.
- Cross-platform pass: ZN-441: gltfpack built on aarch64 macOS and Linux gives the packs of x86_64; the three plugin's meshopt decoder (NEON on the Pi, SIMD on wasm) decodes the truck as on the Mac (tests/t1/model.sh).

usage: n/a (tools/usage printed n/a in the worktree)
<!-- SECTION:NOTES:END -->
