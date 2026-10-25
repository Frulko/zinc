---
id: ZN-829
title: Blender asset library scene publication and safe Zinc reimport
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - blender
  - assets
dependencies: []
ordinal: 538460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Implement the production workflow foundation: Blender collection libraries, nested references, stable identities, explicit publish, versioned scene metadata, source mapping and validated incremental reimport.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Blender extension publishes nested assets scenes instances cameras collisions triggers and sockets with stable validated identities
- [x] #2 Published manifests distinguish source identity content revisions and dependencies and reuse Zinc asset caches and packs
- [x] #3 A Zinc scene viewer reloads a validated revision while preserving compatible state and rejects failed publications atomically
- [x] #4 Fixtures prove duplicate identity missing reference cycle diagnostics deterministic unchanged export and source provenance
- [x] #5 World authoring metadata validates positive finite cell size and classifies static collision geometry separately from dynamic/behavior subtrees without losing IDs
- [x] #6 World-marked static descendants compile through the Tokyo .zworld importer in zinc assets build and bypass individual SceneRevision nodes with builder-authoritative cell/batch provenance
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Implementation notes

Shared zinc.scene v1 boundary implemented first for the Blender/Godot exporters. Validator tests cover deterministic no-op publication, last-valid atomic record, duplicate/missing/cyclic identity diagnostics and provenance paths. Remaining acceptance criteria are open until the actual Blender and runtime slices execute.

Runtime reader check passed with the interpreter: duplicate/missing/cyclic nodes rejected while prior scene and delivery state remain live. Asset mesh instances share buffers; replacement releases old mesh handles. Repeated decoded texture lifetime remains an explicit existing-loader limit.

Completed vertical slice: actual Blender 5.2.1 library.blend (96 KB), extension manifest/operator and installable ZIP builder, nested cottage/lantern libraries (26 nodes, seven GLBs), source mapping, authored camera/boxes/triggers/socket/spawn, Stage viewer with explicit file reimport, gameplay gate state and rejection display. Unsupported static-profile objects/shaders/modifiers fail explicitly; animation remains ZN-830.

Executed proofs (2026-10-25): Blender build.py generated and rendered actual project; Blender verify.py passed deterministic identical export/mtime, duplicate-ID rollback and transform-only unchanged mesh hashes. `tests/run --only scene_exchange` PASS (four Python tests and actual Zinc interpreter rollback/state test); `tests/run --only blender_library` PASS (300 frames, one idle draw, real pixel golden). `zinc check examples/blender-library` PASS. `zinc assets build examples/blender-library`: eight imports then repeat eight cache hits, one 32,342-byte ZPK. Extension ZIP built successfully. Actual Blender and Zinc captures checked by eye; they are explicitly different shading contracts. No cross-platform, window/focus, repeated texture lifetime, or animation proof claimed.

Owner extension (2026-10-25): reopen for world metadata/baking. Independent metadata, collection inheritance, partition and provenance seed implemented/tested. `worldSources` retains node/source/world IDs; behavior/animated/active-body/explicit-dynamic subtrees remain entities, static collision geometry is mergeable. Raw world publications are rejected atomically by the loader until binary baking is real.

Integration dependency: current develop cd51f9e0 has no include/zn/zworld.h or Tokyo importer. Do not invent binary layout, level thresholds or cell/batch IDs. After Tokyo lands, inspect that header/importer, validate `levels` with its real contract, route zinc assets build through it, add authoritative source-to-cell/batch mappings, and prove no static descendant SceneRevision nodes remain. Then tick #6 and restore Done. Existing static library remains runnable and tested.

Tokyo dependency arrived on develop (ZWD1 introduced by 97aeb5dd, current develop f801f7d6). This branch takes the existing World renderer/header/test snapshot from develop and reapplies its own meshDeform addition; the dependency snapshot commit is not a change to integrate back into develop. `tests/run --only zinc3d_world` PASS on the real native plugin. Proceeding with native asset importer and compiled-scene/runtime/provenance integration.

World integration delivered: reuses the landed `src/assets/world.cpp` importer via glTF instance refs (stable ID + global matrix), not a second writer/simplifier. `levels` is an included near/mid/far name subset. `as:scene` packs `scene.runtime.json`, existing .zworld/chunks and enriched authoritative .zworld.json. Static descendant nodes/assets leave the runtime entity catalogue; retained semantic descendants preserve global TRS (shear rejected). Provenance keeps every removed object, original asset IDs/hashes, static collision metadata/global matrix, and the builder's exact cell/level/chunk/batch tuples. Picking yields candidates because fused batches can contain several objects; no invented triangle ranges. World handles dispose/reuse and malformed revisions keep the last valid live world.

Actual proof: reopened original library.blend, saved authoring/world.blend and published 26 nodes. `blender_world` PASS: 14 fused identities, 12 entities, 4 retained assets, 2 cells/4 chunks, two static collision records, Inspector candidate mapping, eight unchanged handle reuses, bad revision/chunk hash rollback, cached no-op build and failed build retains byte-identical pack. `scene_exchange`, `zinc3d_world`, `blender_library`, `animated_scene`, `lantern_post` PASS. Actual headless Zinc capture in examples/blender-world/authoring/zinc-preview.png. No large-world timing/RSS claims: small fixture eagerly validates chunks and loads provenance with scene metadata; background staging deferred until measured scale requires it. Native render3d golden updated for lifecycle/deformation methods. Dependency snapshots 61c798be and da284ebb are not feature commits for coordinator integration.
