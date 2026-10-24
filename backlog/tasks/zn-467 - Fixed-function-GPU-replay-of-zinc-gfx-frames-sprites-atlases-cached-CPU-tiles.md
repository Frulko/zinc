---
id: ZN-467
title: >-
  Fixed-function GPU replay of zinc:gfx frames (sprites, atlases, cached CPU
  tiles)
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
updated_date: '2026-10-24 22:48'
labels:
  - gpu
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-453
ordinal: 214552
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A shared module that turns HalCmdList (CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP) into quads for GPUs without fragment shaders: vertex-colour gradients, a glyph atlas (A4/A8), a corner atlas for radii and borders, scissor for rectangular clips, and CPU-rasterized tiles cached by CmdSig hash for POLY, SHADOW, radial gradients and rounded clips. Backend interface: upload texture, set scissor, draw quads, draw tile, present. A CPU reference backend runs it on the desktop for tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the layout fixtures and the bouncing-ball and kit-gallery scene dumps, the CPU reference backend matches runtime/raster.cpp within the display-gl tolerance (T1)
- [ ] #2 quads per frame, tiles per frame and tile cache hits are reported by zinc -v
- [x] #3 the backend interface has no platform header in it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (owner: 'fais le support gpu de la psp et après de la 3ds'): targets/console/ff_replay.{h,cpp} is the shared replay, the platform-free half of targets/vita/gxm_vita.cpp (drawable, text through a 512x512 A8 glyph atlas, images with atlas boxes, flips, tint, alpha and filter, rectangular clips cut on the CPU). Backend interface: texture(), glyphs(), glyph_memory(), glyphs_written(), draw_quad(); no platform header (AC #3). Used by targets/psp/gu_psp.cpp (ZN-468) and targets/n3ds/c3d_n3ds.cpp (ZN-469). A frame with RECT radius or gradient, BORDER, SHADOW, LINE, POLY, XFORM, layer images or non-normal blends is not drawable: the HAL rasterizes it and the GPU shows it as one texture. Not done yet: the corner atlas for radii and borders, the CPU tiles cached by CmdSig, the desktop CPU reference backend and its T1 against runtime/raster.cpp (AC #1), the quads/tiles/cache-hit counters in zinc -v (AC #2). gxm_vita.cpp still has its own copy (the other session moves the Vita to vitaGL); it can call ff_replay once that settles.

2026-10-25 (owner: 'go' on the corner atlas): the single-colour shapes are on the GPU without new formulas: ff_replay asks runtime/raster.cpp to draw the command once in white on black (RECT with a radius, BORDER, SHADOW, POLY without gradient), keeps the coverage in a second 512x512 atlas (atlas 1) keyed by the shape and its pixel fractions (a POLY by its absolute points), and stores only the longest runs of equal columns and rows once: a card of any size is its corners plus a 9-slice of at most 9 quads. The atlas is emptied when full, only between frames (quads_pending). A refused command is named once on the log ('gpu replay: a frame with a ... is rasterized in software'). Proof: examples/hardware-psp and examples/hardware-n3ds, every page in PPSSPP and Azahar, no frame left to the software raster; hardware-psp identical to the software path but its clock (tolerance 8); PSP worst frame CPU 15.5 ms -> 1.6 ms. Left in software: gradients (RECT grad, paint records), rounded CLIPs, XFORM, LINE, STROKE, images with a radius or a blend mode. Texture edges: the last row and column are repeated beyond the image (the raster clamps; zeros made filtered edges fade).
<!-- SECTION:NOTES:END -->
