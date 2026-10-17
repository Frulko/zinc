---
id: ZN-468
title: 'PSP: GE backend for the fixed-function replay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 09:37'
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
ordinal: 214564
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. PSP lessons: the GE is bus-bound (0.7 ms per 1,000 triangles sent, drawn or not; an FPU multiply-add 20 cycles; a cache-line fetch during GE drawing ~1 us): cull by cluster (cone, sphere, PVS), order indices by facing sector, cook guard-band cut records, 16-bit signed positions at x32768 (never float), two depth ranges, a 5650 framebuffer with dither, 333/333/166 MHz clocks first, a display-vcount guard.
<!-- SECTION:NOTES:END -->
