---
id: ZN-832
title: LibGodot desktop game hosted by a Zinc application demo
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:01'
labels:
  - size-L
  - godot
  - embed
dependencies:
  - ZN-825
ordinal: 541460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Implement the separate experimental full-runtime integration with a pinned LibGodot desktop build, keeping its behavior and requirements distinct from Godot-to-Zinc conversion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pinned reproducible LibGodot build runs a small Godot game within one Zinc-owned desktop application
- [ ] #2 Zinc navigation or controls exchange bounded commands and state with the hosted game
- [ ] #3 Actual surface input lifecycle and engine shutdown are tested without claiming unsupported restart or multi-instance behavior
- [ ] #4 Documentation states retained Godot platform renderer and runtime requirements and includes a runnable proof
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
