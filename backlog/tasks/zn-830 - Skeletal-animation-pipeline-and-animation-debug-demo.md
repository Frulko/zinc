---
id: ZN-830
title: Skeletal animation pipeline and animation debug demo
status: Ready
assignee:
  - '@parallel'
created_date: '2026-10-25 11:01'
labels:
  - size-L
  - blender
  - animation
  - 3d
dependencies:
  - ZN-829
ordinal: 539460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-25): launch the Swift/Godot/Blender workflows and demos with agents. Add real Blender glTF skeletal animation to Zinc using a pinned proven animation library where appropriate, with skinning clips blending events sockets and debug controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A real skinned character deforms correctly with imported bind pose weights and named clips
- [ ] #2 Idle walk run transitions loop policy playback speed root motion ownership and attachment sockets are demonstrated
- [ ] #3 Pause seek single step blend inspection and event metadata are available with regression coverage for loops and seeks
- [ ] #4 A pinned licensed animation dependency if used and supported target limits are documented with a runnable animation lab
<!-- AC:END -->

## Delivery contract

Owner clarification (2026-10-25): deliver a real runnable project, source files, a README with exact build/run/test commands, required native or authoring project files, and actual execution evidence. A specification or mock alone does not satisfy this task. Do not mark unsupported or unexecuted behavior as Done.
