---
id: ZN-827
title: Godot scene exporter and standalone Zinc Parcel Yard demo
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
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
- [ ] #1 A Godot editor export transfers nested transforms shared model instances cameras and typed gameplay markers
- [ ] #2 A standalone Zinc demo runs the exported scene and Zinc-written interaction logic without Godot
- [ ] #3 Unsupported scripts shaders extensions and missing references produce precise compatibility diagnostics
- [ ] #4 Pinned Godot tooling repeatable export fixtures and targeted regression tests prove the supported subset
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
