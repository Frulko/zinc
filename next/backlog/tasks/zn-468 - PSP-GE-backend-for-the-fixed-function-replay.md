---
id: ZN-468
title: 'PSP: GE backend for the fixed-function replay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - gpu
  - handheld
  - handhelds
  - psp
  - size-L
milestone: m-23
dependencies:
  - ZN-463
  - ZN-467
ordinal: 300150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
hh-ff-replay backend on sceGu: GU_SPRITES with 16-bit vertices in GU_TRANSFORM_2D, swizzled T4/T8 glyph and corner atlases with a CLUT in VRAM, 5650 framebuffer with GE dithering, sceGuScissor, double-buffered lists from sceGuGetMemory with one cache writeback per frame, textures at most 512, wide textures drawn in strips.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kit-gallery and bouncing-ball PPSSPP screenshots match the CPU reference within the hh-ff-replay tolerance
- [ ] #2 CPU time per frame for bouncing-ball with 500 balls is at least 3x lower than psp-ball (measured on hardware or marked as PPSSPP)
- [ ] #3 no texture exceeds 512x512
<!-- AC:END -->
