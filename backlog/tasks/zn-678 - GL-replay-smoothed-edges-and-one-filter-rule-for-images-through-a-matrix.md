---
id: ZN-678
title: 'GL replay: smoothed edges and one filter rule for images through a matrix'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:21'
updated_date: '2026-11-09 06:54'
labels:
  - gpu
  - gfx
  - size-S
dependencies: []
ordinal: 12100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) Under setTransform the raster smooths the edge of a turned image and the GL replay cuts it (0.217% of pixels over 24 on tests/data/image_rect/xform.ts, max 84), and a whole opaque runtime image at one texel per pixel is sampled nearest by GL but linearly by the raster. The museum table and the pinball editor draw turned images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 xform.ts and gfx_transform under 0.05% of pixels over 24 at the same density
- [x] #2 the plain (untransformed) frames unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 in a parallel worktree (chain ZN-678, ZN-444).

Web search (sonnet sub-agent): Skia GrQuadPerEdgeAA / Graphite PerEdgeAAQuadRenderStep (quad outset by half a pixel, per-edge distance in pixels, coverage clamp(d), no derivatives: https://skia.googlesource.com/skia/+/6169a1fabae1/src/gpu/graphite/render/PerEdgeAAQuadRenderStep.cpp), WebRender (AA only when the transform is not axis-aligned, the quad extruded and a local-space position passed to the fragment, the distance scaled by the transform: https://kdab.searchfox.org/firefox-main/source/gfx/wr/webrender/res/ps_quad.glsl), fwidth needs OES_standard_derivatives (not in GLSL ES 1.00), Skia's nearest rule (integer translate only, SkBitmapProcState just_trans_integral). Taken: WebRender's local-space distance with the scale computed on the CPU, as raster.cpp draw_xform already does (0.5 - d sc).

How (runtime/gl_replay.cpp draw_image, gl_replay_shaders.h FS_IMAGE): under a matrix the image quad is the rectangle (intersected with the image box) grown by 1/sc in its own units (sc = sqrt |det|, the raster's scale), with mode + 16; the fragment gets its position in the box's units times sc from the image box's origin (v_pos.zw), the rectangle in v_box and the image box's size times sc in (p1, r). The texel is read at the position clamped into the rectangle (c +- h * 0.9998: the raster's 1e-4 of the width), the coverage is min(cover(rectangle), cover(image box)), as draw_xform. One filter rule under a matrix, the raster's: linear unless ImageFlag.Nearest, for baked and runtime images alike (GL took nearest for a whole opaque runtime image at one texel a pixel, linear for a baked image asked nearest), and no ImageFlag.Smooth spline (the raster samples bilinearly there). Turned images stay out of the lean programs. The untransformed path is not touched. Rounded corners on a turned image are still not drawn by the GPU (r carries the box; a tint has none): unchanged from before.

Measured (M1 Pro, one windowed GL run each, ZINC_BACKGROUND=1, 5 frames, glcompare against the software frame at the window's density):
- xform.ts (density 4): before 0.195% over 24, mae 0.099, max 84; after 0.000%, mae 0.031, max 3. xform_check.py on the GL frame: 1426 pixels inside the texels of 5 sprites (slack 2).
- gfx_transform (density 2): before 0.068%, mae 0.044, max 151; after 0.043%, mae 0.034, max 151. The images of the 15 and 45 degree columns are clean; what is left is turned text, the scaled group's rounded rect and text, and the polygon/stroke (not images).
- main.ts, plain frames (density 4): 0.000%, mae 0.052, max 2 before and after (AC #2). sprite.ts (turned, tinted, blended): 0.000%, mae 0.066, max 21.
- GLSL ES 1.00: build/gl_replay_es2: 110 programs ok.

Test: tests/t1/image_rect_gl.sh now wants under 0.05% for xform.ts (was 1%).

Decision to record (proposed text): GL replay images through a matrix: the GPU draws a turned image as raster.cpp draw_xform does: edges smoothed by 0.5 - d sc on the rectangle and the image box, the texel at the position clamped into the rectangle, linear unless ImageFlag.Nearest, no spline. The quad is grown by one pixel and the fragment works in the box's units times sc, so no derivative (GLSL ES 1.00) and no new attribute. Rejected: per-edge distances as four varyings (Skia): one more vec4 per vertex for every quad; fwidth: OES_standard_derivatives is not on every GLES 2 device. Follows D73 (which said the GL replay cuts it).

later.md lines:
- ZN-678: rounded corners of a turned image on the GL replay (raster draws them; the radius slot carries the image box under a matrix).
- ZN-678: turned text and the scaled group of gfx_transform still differ on GL (0.043% over 24, max 151): glyph sampling under a matrix.

Proposed tests: tests/run --only image_rect_gl (GL xform frame under 0.05%, about 20 s, one window, under 200 MB); tests/run --only gfx_transform (GL frame within its tolerance, about 15 s).
<!-- SECTION:NOTES:END -->
