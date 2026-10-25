---
id: ZN-828
title: Godot Warehouse with embedded Zinc user interface
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - godot
  - embed
  - ui
dependencies:
  - ZN-825
ordinal: 537460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Build a Godot GDExtension hosting Zinc UI via the shared embedding boundary: inventory search settings and HUD over a Godot 3D scene.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An actual Godot project runs Zinc UI with bidirectional inventory and settings state
- [ ] #2 Pointer capture focus keyboard text and polled gameplay input routing are demonstrated
- [ ] #3 A transparent HUD composites correctly with an explicit alpha contract and persistent texture lifecycle
- [ ] #4 A reproducible extension build packaged run README and targeted integration tests cover resize teardown and idle
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
