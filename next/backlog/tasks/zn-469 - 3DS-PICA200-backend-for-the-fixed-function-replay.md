---
id: ZN-469
title: '3DS: PICA200 backend for the fixed-function replay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3ds
  - gpu
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-465
  - ZN-467
ordinal: 300160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
hh-ff-replay backend on citro3d: one picasso vertex shader for 2D quads (optionally a geometry shader expanding one vertex per rectangle), TEV stage 0 vertex colour times texture, tiled textures from tex3ds or GX_DisplayTransfer, A4/LA4 glyph atlas, scissor; compare with citro2d before writing more.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kit-gallery and bouncing-ball screenshots (RetroArch core, software renderer) match the CPU reference within tolerance
- [ ] #2 bouncing-ball maximum ball count at 60 fps is at least 3x the n3ds-ball figure for the same 3DS model
- [ ] #3 the choice between citro2d and own batches is recorded with numbers
<!-- AC:END -->
