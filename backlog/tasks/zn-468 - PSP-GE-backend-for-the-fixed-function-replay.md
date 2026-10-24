---
id: ZN-468
title: 'PSP: GE backend for the fixed-function replay'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
updated_date: '2026-10-24 22:20'
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
- [x] #1 kit-gallery and bouncing-ball PPSSPP screenshots match the CPU reference within the hh-ff-replay tolerance
- [x] #2 CPU time per frame for bouncing-ball with 500 balls is at least 3x lower than psp-ball (measured on hardware or marked as PPSSPP)
- [x] #3 no texture exceeds 512x512
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. PSP lessons: the GE is bus-bound (0.7 ms per 1,000 triangles sent, drawn or not; an FPU multiply-add 20 cycles; a cache-line fetch during GE drawing ~1 us): cull by cluster (cone, sphere, PVS), order indices by facing sector, cook guard-band cut records, 16-bit signed positions at x32768 (never float), two depth ranges, a 5650 framebuffer with dither, 333/333/166 MHz clocks first, a display-vcount guard.

2026-10-25: targets/psp/gu_psp.cpp: sceGu, two 8888 buffers in VRAM swapped at vblank, GU_SPRITES in GU_TRANSFORM_2D with float vertices, textures in main memory (8888, glyph atlas T8 with a CLUT of white at every alpha), at most 512x512 (a larger image makes the frame software, AC #3), one sceGuSync a frame. ZINC_PSP_GPU=0 keeps the software path. PPSSPPHeadless proofs: bouncing-ball (1 and 600 balls) pixel-identical to the software path (pngdiff 0); breakout's pad session ends on its golden framehash c530a035c9c051e5, title screen within 7 levels (filtered sprites); examples/kit-gallery no longer exists, examples/hardware-psp (the rich UI demo) is identical but for its clock (rounded buttons: drawn as the software texture). CPU per frame with 600 balls (PPSSPP, not authoritative): software render + conversion 6.24 ms p50, GE replay 0.48 ms + present 0.01 ms (13x, AC #2). Upgrades for the hardware pass: swizzled textures, a 5650 framebuffer with dither, building the next list while the GE draws (backlog/later.md line).
<!-- SECTION:NOTES:END -->
