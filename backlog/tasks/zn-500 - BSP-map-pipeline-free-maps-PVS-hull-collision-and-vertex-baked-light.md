---
id: ZN-500
title: 'BSP map pipeline: free maps, PVS, hull collision and vertex-baked light'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
  - parked
milestone: m-23
dependencies:
  - ZN-489
  - ZN-452
ordinal: 93000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For a Strike-class FPS: read BSP (GoldSrc v30 from Blender through SDHLT, or LibreQuake BSP29, both free), subdivide faces on a world grid before i16 snapping, sample lightmaps per vertex with overbright, keep textures CLUT8 with mips, cook PVS (nodes, leaves, RLE rows) and clip hulls into the pack, and provide point-to-leaf, PVS decode and hull traces as runtime code. No copyrighted maps in the repository or packages. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At least one free map cooks for psp30 with counts (faces, vertices, leaves, PVS bytes) in the receipt
- [ ] #2 Hull traces match a reference implementation on a scripted set of moves (T1)
- [ ] #3 PVS visible sets match the reference for 100 sample points
- [ ] #4 The pack viewer flies the map
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
