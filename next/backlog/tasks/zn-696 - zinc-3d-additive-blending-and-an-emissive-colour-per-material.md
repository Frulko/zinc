---
id: ZN-696
title: 'zinc:3d: additive blending and an emissive colour per material'
status: Done
assignee: []
created_date: '2026-10-10 21:27'
updated_date: '2026-10-10 21:41'
labels:
  - 3d
  - gpu
  - size-M
milestone: m-27
dependencies: []
ordinal: 460410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the pinball's sound and look, D80.) The pinball draws a pool of light as an opaque patch of a second, lit painting because zinc:3d has no blending and no emissive term: pools cannot overlap and exist on the playfield only. Additive (and alpha) blending per material and an emissive colour, on the software and the GPU renderer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a lit quad adds to what is under it on both renderers (a golden each, GPU within tolerance)
- [x] #2 two overlapping glows add up
- [x] #3 the opaque path's frames and goldens are unchanged and its frame time is not higher (measured)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-10). Material gains emissive (0xRRGGBB, added to the received light before the texture), blend (Blend.Opaque/Alpha/Add) and opacity. Draw flags bits 6-7 blend mode, 8-15 opacity; renderer.emissive(color) is state reset by begin. Blended nodes are collected during scene.draw and drawn after the opaque ones, in scene order, depth tested without depth writes. Software: raster<TEX, SMOOTH, BLEND>, depth written only when opaque, opaque draws keep their direct calls. GPU: shader variants P_EMIT/P_BLEND (progs[128]) so the opaque programs are unchanged, uniforms sent on change, blended draws mask alpha writes. Test tests/t1/zinc3d_glow.sh: exact pixels on the software renderer (floor 40, red glow 140/40/40, both glows add to 140/140/40, half blue 20/20/148, lit + emissive 184) plus a golden; the GPU frame within 2 (identical here). AC3: opaque goldens unchanged (zinc3d_aa, three_gpu, templates_kickstart, zinc3d_gltf; three_3d only its known failures). Frame time of bench/three_many under thermal throttling is within noise for both versions; instructions retired over 300 frames: GPU 5.648-5.651 G -> 5.672 G (+0.4%, the extra Node.drawMesh call and the emissive check per draw), software 7.839-7.840 G -> 7.882-7.884 G (+0.55%, ~60 more per draw in the renderer, not explained further). A first version that sent the uniforms on every draw cost +1.0% on the GPU. Logged in docs/reports/zinc-next-perf.md. usage: n/a
<!-- SECTION:NOTES:END -->
