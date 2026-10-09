---
id: ZN-491
title: GE 3D kernel and renderer v1 for cooked packs (PSP)
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-468
  - ZN-490
ordinal: 300380
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Native module for the GE (clean-room): display-list ring double-buffered and 64-byte aligned, frame pool with dcache writeback and explicit retirement after sceGuSync, CLUT8 and 565 texture binds with sceGuTexFlush, matrices. Renderer in TS on top: inverted 16-bit depth, two depth ranges (near cells and far levels), i16/u16 vertex types with the x32768 model scale, per-cell frustum culling, linear fog fitted to exp2, sky gradient, 5650 dithered framebuffers to free eDRAM, hottest textures copied to eDRAM, UI pass last with the GE 2D renderer. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sample pack renders in PPSSPP within tolerance of the pack viewer at three route marks
- [ ] #2 Display list <= 256 KiB per frame; no float positions in 3D draws
- [ ] #3 Bench on hardware: 30 fps with 0 late frames over the route at <= 40k triangles, or the receipt and the cause recorded
- [ ] #4 A hardware pitfall checklist (dcache lines, texture flush, CLUT width) is run and recorded
<!-- AC:END -->
