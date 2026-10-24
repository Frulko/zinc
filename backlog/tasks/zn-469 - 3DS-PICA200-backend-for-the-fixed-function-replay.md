---
id: ZN-469
title: '3DS: PICA200 backend for the fixed-function replay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-24 22:20'
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
ordinal: 214574
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: targets/n3ds/c3d_n3ds.cpp: citro3d, one 240x400 RGBA8 render target transferred to the top screen (Mtx_OrthoTilt), quads as two triangles of float vertices, vertex shader targets/n3ds/ff.v.pica (picasso, linked through ctr_add_shader_library), TEV stage 0 colour / texture x colour / A8 coverage x colour, textures tiled on the CPU (8x8 Morton), sides 8..1024. The PICA's t runs from the last row in memory (0) to the first (1): v = 1 - v * h / th. Stereo and the bottom screen stay on the CPU (the HAL switches back to the software path while stereo is on). ZINC_N3DS_GPU=0 keeps the software path. Azahar proofs: bouncing-ball with 600 balls pixel-identical to the software path; breakout's title screen within 4 levels. CPU with 600 balls (Azahar, not authoritative): replay 0.74 ms p50 against 2.41 ms of software raster plus the rotated copy. Choice (AC #3): own batches over citro2d, because the shared replay already cuts and batches its quads and citro2d multiplies a tint only in its newer tint modes; no citro2d numbers measured. Left: AC #1 with RetroArch's core (Azahar used here) and kit-gallery (gone; examples/hardware-n3ds is the rich UI demo), AC #2 as a ball count on hardware.
<!-- SECTION:NOTES:END -->
