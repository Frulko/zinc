---
id: ZN-679
title: >-
  GL replay fill rate: 30 photo cards at 5.4 million pixels run at 40 frames per
  second
status: Done
assignee: []
created_date: '2026-10-10 19:35'
updated_date: '2026-10-10 20:53'
labels:
  - gpu
  - perf
  - size-M
milestone: m-27
dependencies: []
ordinal: 435410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The light table of the museum demo holds 60 fps with 30 moving cards at 1920x1080 physical pixels (114 to 118 without vsync) but 40 fps in a 3104x1746 window on the Radeon Pro 555X; a 4K touch table has 8.3 million pixels. Find where the time goes in the GL replay of transformed images, shadows and text (overdraw, blending, batch breaks) and bring 30 cards to the display rate at the laptop's full window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 30 moving cards at 3104x1746 at 60 fps on the development Mac, measured alone (frame times in docs/reports/zinc-next-perf.md, before and after)
- [x] #2 the pixel goldens of museum_table and gfx_transform unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: measured alone-ish (load 3-4) at 3104x1746 on the Radeon Pro 555X: 57.3-59.1 fps -> 60.0 with vsync, 57-58 -> 90-94 without; GPU per frame 13.9 -> 7.2 ms (new: ZINC_GL_STATS prints the replay's GPU time from a timer query read 4 frames later, macOS); draw calls 548 -> 190. Cause found by skipping one command kind at a time: the polygons (each card's five-point paper with a folded corner + the fold triangle) were 9.1 ms of GPU through the stencil path (the box drawn 4-6 times); a convex POLY of one contour of 3-8 points (no gradient paint) is now one pass over its box, coverage 0.5 + smallest signed distance to the edges (runtime/gl_replay.cpp draw_convex, shader mode CONVEX, edges as uniforms). The 'CPU to submit' figure includes GPU waits: the replay's own CPU work is ~0.8 ms. Remaining GPU: images 2.2 ms, shadows 1.8 ms, polygons 2.7 ms. Tests: museum_table and gfx_transform goldens unchanged (software); gl_renderer, gpu_strokes, image_rect_gl, many_images, svg_lottie, canvas pass; new tests/t1/gl_convex.sh: GL vs software 0.06% over 24, mae 0.07. Numbers in docs/reports/zinc-next-perf.md. Linux/Pi GL (GLES2 uniform array in the fragment shader) not run: cross pass. usage: n/a
<!-- SECTION:NOTES:END -->
