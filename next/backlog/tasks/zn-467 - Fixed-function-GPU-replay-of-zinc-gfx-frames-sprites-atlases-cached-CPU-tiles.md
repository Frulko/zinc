---
id: ZN-467
title: >-
  Fixed-function GPU replay of zinc:gfx frames (sprites, atlases, cached CPU
  tiles)
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - gpu
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-453
ordinal: 300140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A shared module that turns HalCmdList (CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP) into quads for GPUs without fragment shaders: vertex-colour gradients, a glyph atlas (A4/A8), a corner atlas for radii and borders, scissor for rectangular clips, and CPU-rasterized tiles cached by CmdSig hash for POLY, SHADOW, radial gradients and rounded clips. Backend interface: upload texture, set scissor, draw quads, draw tile, present. A CPU reference backend runs it on the desktop for tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the layout fixtures and the bouncing-ball and kit-gallery scene dumps, the CPU reference backend matches runtime/raster.cpp within the display-gl tolerance (T1)
- [ ] #2 quads per frame, tiles per frame and tile cache hits are reported by zinc -v
- [ ] #3 the backend interface has no platform header in it
<!-- AC:END -->
