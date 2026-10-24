---
id: ZN-506
title: 'Town traversal demo at 60 fps: 5,400 houses, cells, LOD, collision, wire hooks'
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
ordinal: 97000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Maneuver-class demo from public information: a procedural walled town (bands, blocks, row houses, one strip atlas, about 5,400 houses, landmarks, bridges, a few giants), cooked into cells with LOD and a collision world, runs of cells drawn in one draw (clip groups on PSP), and wire-hook movement at speed. Target 60 fps on PSP, Vita, 3DS and iPhone 4S. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hardware receipts at 60 fps (or the measured rate with cause) on the four devices over a fixed traversal tape
- [ ] #2 No representation switch visible inside the field of view (reviewed on device)
- [ ] #3 Collision and hook physics are deterministic on the tape (byte-identical state hash)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
