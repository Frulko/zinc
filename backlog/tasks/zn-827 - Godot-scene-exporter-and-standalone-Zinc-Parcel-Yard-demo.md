---
id: ZN-827
title: Godot scene exporter and standalone Zinc Parcel Yard demo
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
updated_date: '2026-10-25 11:34'
labels:
  - size-L
  - godot
  - assets
dependencies:
  - ZN-829
ordinal: 536460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Export an explicitly supported subset of Godot scenes to shared assets and a versioned scene manifest, reconstructed by Zinc-written gameplay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Godot editor export transfers nested transforms shared model instances cameras and typed gameplay markers
- [x] #2 A standalone Zinc demo runs the exported scene and Zinc-written interaction logic without Godot
- [x] #3 Unsupported scripts shaders extensions and missing references produce precise compatibility diagnostics
- [x] #4 Pinned Godot tooling repeatable export fixtures and targeted regression tests prove the supported subset
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented real Godot 4.6-stable project, authored yard, editor plugin, headless exporter and standalone Zinc Parcel Yard. Official universal archive verified SHA512. tests/run --only godot_export passed with Godot headless deterministic repeated export, shared crate IDs, script/material/duplicate rejection preserving prior manifest, shared scene validation, Zinc check and 30-frame scripted delivery/open/reset. Captured and inspected tests/golden/godot-export/yard.png. Dependency commits 4a1f109f and d228602b consumed (local cherry-picks cef3d1f2/65ef851e); integrate upstream dependency commits once only. No target builds, GPU visual parity or other-platform execution claimed.

Owner world extension followup: Godot exporter now preserves zinc_world {cell,levels} and typed zinc_dynamic flags, uses shared partition_world to retain static-source provenance. Real headless regression verifies shared world values, dynamic child separation, static crate source identity, and invalid cell atomic rollback. tests/run --only godot_export PASS after consuming shared world schema dependency74f08201. No raw world rendering or missing zworld builder implementation claimed; SceneRevision deliberately rejects uncompiled world publications.
<!-- SECTION:NOTES:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
