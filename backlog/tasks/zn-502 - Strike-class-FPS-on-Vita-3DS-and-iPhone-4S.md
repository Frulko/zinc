---
id: ZN-502
title: 'Strike-class FPS on Vita, 3DS and iPhone 4S'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
  - parked
milestone: m-23
dependencies:
  - ZN-492
  - ZN-498
  - ZN-501
ordinal: 96800
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
