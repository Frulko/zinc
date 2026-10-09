---
id: ZN-495
title: 'PICA200 3D renderer: picasso programs, TEV stages, fog LUT, tiled textures'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-490
  - ZN-474
ordinal: 300420
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PICA kernel (clean-room): linear-memory buffers and textures with explicit release after the GPU, cache flushes, C3D frame handling. Renderer: picasso vertex programs for the pack layouts (s16 positions, colour, sector byte selecting one of 17 lights with mova), up to three TEV stages, fog LUT, reversed depth, ETC1/565 textures, lower screen for a map or UI. No stereo in v1. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sample pack renders in Azahar (software renderer) within tolerance of the pack viewer
- [ ] #2 Hardware: 30 fps with 0 late frames on the route on the owner's 3DS, CPU and GPU ms recorded
- [ ] #3 Uniform usage stays within 96 float vectors (checked at build)
<!-- AC:END -->
