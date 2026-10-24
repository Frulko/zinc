---
id: ZN-509
title: 'Voxel diorama demo: tile map to voxel chunks with CLUT8 palette tricks'
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
ordinal: 94900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Voxel-class demo on free content: a Tiled map with an open tileset turned into 16x16-tile voxel chunks, CLUT8 atlases with the palette group in the texel index, cook-time hidden-face cull and coplanar same-shade quad merge, stratified detail streams, 16-byte vertices, constant depth bias in the projection, 30 fps outdoors with 60 Hz logic on PSP, Vita at 60. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PSP hardware receipt: outdoor tape at an even 30 fps, interior at 60
- [ ] #2 Vita hardware receipt at 60 fps
- [ ] #3 Cook receipt shows the cull and merge savings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. (drop proposed, corrected by the verifier) Not useless by the brief's definition: the owner listed 'PSP, PS Vita, 3DS, iPhone 4S (PocketJS/Pocket3D demo parity)' as hardware to target (owner, 2026-10-09, project memory perf-first-and-handheld-targets; docs/reports/hardware/pocketjs-pocket3d.md:700 proposes the 'PocketJS/Pocket3D parity' milestone) and AGENTS.md names PocketJS as the performance reference; far and board-bound is park, not drop (BRIEF rule).
<!-- SECTION:NOTES:END -->
