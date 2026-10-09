---
id: ZN-502
title: 'Strike-class FPS on Vita, 3DS and iPhone 4S'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-494
  - ZN-496
  - ZN-498
  - ZN-501
ordinal: 300490
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the Strike-class FPS renderers: GXM (two passes or one Cg program), PICA (TEV modulate, alpha test, character blend in the vertex program, touch map on the lower screen), GLES2 on the 4S with touch controls. Same TS game. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each port runs the combat tape with a hardware receipt (60 fps target on Vita and 4S, 30 or better on 3DS recorded)
- [ ] #2 Emulator goldens on Vita3K and Azahar
- [ ] #3 No game logic differs between targets (shared source)
<!-- AC:END -->
