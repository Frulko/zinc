---
id: ZN-681
title: 'Museum table: ship the vase as a decimated GLB'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-10 19:36'
updated_date: '2026-11-12 08:10'
labels:
  - demo
  - assets
  - size-S
dependencies: []
ordinal: 19100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The viewer accepts glTF/GLB and the Smithsonian's 150k-triangle GLB gives the better frame, but it would take the example to 11.4 MB, so the decimated OBJ ships and the GLB path has no automated test. A GLB writer in the example's tools/decimate.cpp gives a small GLB and puts the path under test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the example ships a decimated .glb under its size limit and museum_viewer runs on it
- [ ] #2 the OBJ and the GLB give the same frame within tolerance
<!-- AC:END -->

## Implementation Notes

2026-11-12: AC1 is demonstrated by the shipped default GLB and the actual native museum viewer for six headless frames (porcelain/story), with its screenshot inspected. The named `museum_viewer` scripted demo test was not selected or run. AC2 remains open: no pixel comparison or tolerance approval is claimed. Review retains the task and both original criteria.

The 299,100-byte GLB converts the existing 12,000-triangle/7,058-vertex local OBJ, not the unavailable 150k original. The unchanged OBJ is preserved under tools/source, outside the shipped asset inventory; JPEG and attribution are preserved. Source hashes are in LICENSES.md. Whole example authoring inventory before these notes is 10,170,442 bytes, below the unchanged 12,582,912-byte gate; replacing the shipped OBJ saves 734,156 asset bytes. This is a byte count, not a performance measurement. Writer output SHA-256: 75e9382873fb8d6de542a7c98b598fad80f0fbb8ff925bc59ddcce0a38371472.

Research: the primary glTF 2.0 specification (https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), current KHR_materials_specular (https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_specular), and Assimp's glTF importer (https://github.com/assimp/assimp/blob/master/code/AssetLib/glTF2/glTF2Importer.cpp) informed the fixed writer and legacy approximation. Vendored meshoptimizer 1.3/cgltf are reused; no dependency or download was added. Archived specular-glossiness was rejected because the browser r162 loader supports the current extension. Uniform specular colour/strength maps to the existing highlight RGB; Assimp's 1000*(1-roughness)^2 maps shininess. Writer roughness 1-sqrt(48/1000) and colour 38/255 preserve existing vase parameters. This is explicitly an approximation without PBR F0/Fresnel/energy or colour-space conversion. Specular textures and forbidden unlit/specular-glossiness combinations fail, optional or required. Ordinary materials/alpha/unlit/vertex colours retain existing policies.

The shared explicit loadGltfGeometry API returns transformed scene-space triangles only when requested. The editor uses it for actual GLB surface picking, without an OBJ companion/fallback or global CPU geometry retention. Primitive metadata preflights the cumulative 1,048,576-value position/index budget before decoding; consumed auxiliary attribute counts must match POSITION and raw meshopt metadata caps the sum of all document views at 8 MiB (including unused views, conservatively) before accessor decoding. Tiny malformed-count/compressed-size and two-view cumulative fixtures exercise this without a large allocation. Transformed coordinates, index bounds and triangle divisibility are checked. Input buffers/decoder temporaries are additional memory, not included in that returned-array bound. Native and stand-in parse enforce strict disjoint node trees, global single parent, finite transforms, 65,536-node/64-depth limits; distinct nodes may instance meshes, and different scenes may share valid roots.

Touched document ownership now has explicit Vacant/Ready transitions, positive monotonic IDs without wrap, native locking for complete getter/free operations and RAII parse cleanup. Stale get/free cannot touch a replacement document; 16 simultaneously active documents remain supported. Both loaders free documents on failure. This does not resolve all caller-abandoned raw documents at VM unload (D316), nor embedded GLB image ownership. The vase deliberately uses its existing named external JPEG and existing cached-image ownership, with no hidden companion asset.

Decision proposal (coordinator allocates any number): fixed writer + standard uniform extension + explicit requested geometry. Weighted correctness/reuse/effort weights 5/3/2, scores 1..5: selected 5/5/3=46; asset-specific material/picking fallback 1/2/4=19; full PBR/new geometry framework 5/2/1=33. These are design judgements, not measured timings.

### Proof

Own source tree true base 2fafbf09d1cad2b1aa9ef2b57852cd1c8db3eee0. Read-only common CLI compiled 6121edcc8, SHA-256 7da7f4026a6436f68afa97f141fafee188fd901668d97c553420b40cf5f8fb69; no engine build. All heavy commands used main tools/work-run serial queue. Final exact zinc3d_gltf_geometry T0 PASS: interpreter/native/QuickJS exercise shared native code and both loaders, source stand-in registry also executed. Cases include transforms/instancing, actual material defaults/factors/roughness endpoints/alpha/vertex colours, rejected textures/nonfinite/cycles/DAG/depth/output bounds, failure cleanup, stale handles, capacity, and simulated monotonic exhaustion. The Node harness uses the already declared @typescript/typescript6 dependency because installed Node 26.5 rejects transform mode; no compiler was installed and no enum was rewritten to accommodate the harness.

Final museum_decimate_tool T0 PASS: strict tool compile, independent cgltf parse/load/validate, deterministic output, old OBJ path, malformed counts/attributes/indices/lines/oversize inputs, alias and output failure/no-clobber. Final converter regenerated the exact committed vase bytes; independent reader verified all source corners/positions, normalized normals, single UV flip, counts/bounds/material. Strict native host syntax compile with -Wall -Wextra -Werror PASS. Player and editor zinc check PASS (21/32 files). Final real vase proof passes all three engines (glaze/texture/18 matching surface rays); actual native viewer six frames and inspected screenshot PASS.

Full logs retain earlier failed harness/import/header attempts and source snapshots: no claimed final proof comes from those failures. Final .logs/t0-cumulative-review.log (final conservative document-wide compressed-view budget), .logs/t0-metadata-review.log (after the auxiliary metadata review; only the geometry API adds this memory policy), .logs/t0-frozen.log, tool-t0-frozen.log, check-*-frozen.log, native-strict.log, frozen-tail.log, vase-cgltf.log, vase-final-*.out/err, player-vase-final.out/err and vase-player-final.png are retained. Source/proof artifacts and freeze manifest are supplied in .logs/HANDOFF-681.md.

### Proposed tests

- Owner-selected OBJ/GLB same-frame comparison within the existing tolerance, existing museum_viewer session: roughly 30-60s, one viewer at a time, expected under 1 GiB; closes AC2 only on actual comparison.
- Existing museum_assets and museum_editor point-placement UI sessions after selecting the milestone: roughly 30-60s each, expected under 1 GiB; verifies full packaged inventory and real mouse/keyboard workflow beyond the tested shared intersection functions.
- Real browser export and other platform plugin smoke at the cross-platform milestone: short bounded runs, memory unmeasured; source browser loader remains upstream, not executed here.

Later proposals: retain D316 VM-unload/abandoned raw-document ownership and embedded-image lifetime investigation; this migration does not claim either fixed. No suite, demo script, pixel comparison, benchmark, conformance, fuzz or CI was run. No runtime speed/memory or concurrent stress claim.
