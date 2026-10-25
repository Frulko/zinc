---
id: ZN-825
title: Embedded Zinc surface driven by a native host
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:00'
labels:
  - size-L
  - embed
  - native
dependencies: []
ordinal: 534460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Implement one externally driven Zinc instance with an offscreen display, host input and lifecycle. Reuse HalDisplay and HalFrame. Shared foundation for Swift and Godot integrations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A C-importable host boundary drives one Zinc program without creating a secondary window
- [ ] #2 A persistent surface exposes documented dimensions stride channel order alpha ownership and frame lifetime
- [ ] #3 Resize input pause resume and clean shutdown are covered by targeted native tests
- [ ] #4 Existing standalone application behavior remains covered and the host contract is documented
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
