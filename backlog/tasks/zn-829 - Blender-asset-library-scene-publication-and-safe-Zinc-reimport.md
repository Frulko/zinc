---
id: ZN-829
title: Blender asset library scene publication and safe Zinc reimport
status: In Progress
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
- [ ] #1 A Blender extension publishes nested assets scenes instances cameras collisions triggers and sockets with stable validated identities
- [ ] #2 Published manifests distinguish source identity content revisions and dependencies and reuse Zinc asset caches and packs
- [ ] #3 A Zinc scene viewer reloads a validated revision while preserving compatible state and rejects failed publications atomically
- [ ] #4 Fixtures prove duplicate identity missing reference cycle diagnostics deterministic unchanged export and source provenance
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.

## Implementation notes

Shared zinc.scene v1 boundary implemented first for the Blender/Godot exporters. Validator tests cover deterministic no-op publication, last-valid atomic record, duplicate/missing/cyclic identity diagnostics and provenance paths. Remaining acceptance criteria are open until the actual Blender and runtime slices execute.

Runtime reader check passed with the interpreter: duplicate/missing/cyclic nodes rejected while prior scene and delivery state remain live. Asset mesh instances share buffers; replacement releases old mesh handles. Repeated decoded texture lifetime remains an explicit existing-loader limit.
