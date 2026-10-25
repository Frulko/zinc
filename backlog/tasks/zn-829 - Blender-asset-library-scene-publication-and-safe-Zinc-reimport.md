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
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Implementation notes

Shared zinc.scene v1 boundary implemented first for the Blender/Godot exporters. Validator tests cover deterministic no-op publication, last-valid atomic record, duplicate/missing/cyclic identity diagnostics and provenance paths. Remaining acceptance criteria are open until the actual Blender and runtime slices execute.

Runtime reader check passed with the interpreter: duplicate/missing/cyclic nodes rejected while prior scene and delivery state remain live. Asset mesh instances share buffers; replacement releases old mesh handles. Repeated decoded texture lifetime remains an explicit existing-loader limit.

Completed vertical slice: actual Blender 5.2.1 library.blend (96 KB), extension manifest/operator and installable ZIP builder, nested cottage/lantern libraries (26 nodes, seven GLBs), source mapping, authored camera/boxes/triggers/socket/spawn, Stage viewer with explicit file reimport, gameplay gate state and rejection display. Unsupported static-profile objects/shaders/modifiers fail explicitly; animation remains ZN-830.

Executed proofs (2026-10-25): Blender build.py generated and rendered actual project; Blender verify.py passed deterministic identical export/mtime, duplicate-ID rollback and transform-only unchanged mesh hashes. `tests/run --only scene_exchange` PASS (four Python tests and actual Zinc interpreter rollback/state test); `tests/run --only blender_library` PASS (300 frames, one idle draw, real pixel golden). `zinc check examples/blender-library` PASS. `zinc assets build examples/blender-library`: eight imports then repeat eight cache hits, one 32,342-byte ZPK. Extension ZIP built successfully. Actual Blender and Zinc captures checked by eye; they are explicitly different shading contracts. No cross-platform, window/focus, repeated texture lifetime, or animation proof claimed.
