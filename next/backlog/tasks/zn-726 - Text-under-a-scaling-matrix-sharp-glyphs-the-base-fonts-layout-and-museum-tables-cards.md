---
id: ZN-726
title: >-
  Text under a scaling matrix: sharp glyphs, the base font's layout (and
  museum-table's cards)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-12 12:31'
updated_date: '2026-10-12 13:36'
labels:
  - ui
  - text
  - size-M
milestone: m-17
dependencies: []
ordinal: 488410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request, 2026-10-12, seen on museum-table on the Pi: while a card is zoomed its texts are laid out again at every size, so words jump from line to line and the block flickers; 'it should just scale', and 'it is a core UI problem, not the museum's'. Cause: zinc:gfx draws a TEXT under setTransform by sampling the base size's glyph bitmaps through the matrix (D71), which blurs an enlarged text, so examples/museum-table/src/table.ts sets each text again in the ladder font nearest to its size on screen and wraps it again at the scaled width (paintFront, paintBack, paintFilm, paintSpots; src/type.ts). The fonts come in steps, so the breaks move. The engine already lays a text out in logical pixels and draws it with the physical font on a HiDPI surface (runtime/gfx.cpp drawText, phys_font): a scaling matrix should do the same.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A TEXT drawn through a matrix that scales is set with glyphs made for its size on screen (a size step and a residual scale, the glyph cache bounded), its advances those of the base font times the scale: the width of a line is the base width times the scale within a pixel, at every scale from 0.5 to 4
- [x] #2 Without a matrix, and under a matrix that only turns or flips, the frames are the ones of today (the goldens that cover text and transforms pass unchanged)
- [x] #3 The software raster and the GL replay agree on such a text within the tolerance they have today (tests/t1/gfx_transform.sh or a new case), and an enlarged text is as sharp as the same text set directly at that size (a measured comparison, tools/pngdiff --ssim or --mae)
- [x] #4 zinc:ui: a Text inside a view with a scale transform keeps its line breaks and is sharp; a case in the tests says so
- [ ] #5 museum-table wraps the texts of a card once, at the designed size, and draws the card through one matrix that holds its angle and its zoom: in a scripted zoom of a text card and of a notice from 1 to 3 over 60 frames no line changes its break (a test compares the lines), and the frame time of that session is not above today's
- [x] #6 docs: the behaviour in docs/ui.md or the zinc:gfx reference, D71's limit updated in the task notes for the coordinator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Engine (2026-10-12, worktree agent): drawText under a matrix whose larger axis scale is outside 0.84..1.03 keeps the text's own font for the layout (box, advances) and names in the XFORM payload (slot r, +1) a font for the glyphs: the first size of the ladder 8 10 11 13 16 19 23 27 32 38 45 54 64 76 91 108 128 (a quarter of an octave apart) that is not below the size on screen, so glyphs are drawn at 84 to 103 % of their size. runtime/ttf.cpp scaled_font makes them from the TrueType file in their own share of the font table (ZRT_SCALED_FONTS 64 on hosts, 0 on small targets; beyond it or without a file: the closest baked size). Software raster (xf_text, xf_glyph) and GL replay (draw_text, glyphs_ahead now also takes the glyphs of XFORM texts, GLES 2 included) draw them on the base font's advances.
Measured (Mac, software raster, tests/data/text_scaled): width of a mono line between two full blocks = textWidth x scale within 1 px at 0.5 0.7 1 1.3 1.7 2 2.5 3 3.5 4 (widths.py). Sharpness of a 16 px text enlarged against the same text set directly at 32 / 48 px: ssim 0.9903 (before 0.9263), mae 2.00 (before 8.55); edge energy (mean squared neighbour difference) 83 % of the direct text at x2 and 77 % at x3 (before 32 % and 24 %); worst step (glyphs reduced to 87 %): 78 to 82 %. Picking the nearest ladder size instead (glyphs enlarged up to 9 %) gave 63 % at x3: hence the size above. Glyph cache: a zoom through 300 scales from 0.5 to 4 of two families makes 24 fonts, 525 KB of glyphs and tables (resourceStats 'fonts', new counter). GL replay of sharp.ts against the software frame (display-gl, 2x window box-averaged as gfx_transform does): 1.94 % of pixels over 24, mae 1.90 (limits 5 % / 3); its edge energy 2.1 to 2.3 times the one before.
tests/golden/gfx-transform/frame.png: only the 'group' text (scale 1.5) changed, 747 pixels in the box 670,580-727,620; the texts at 0, 15, 45 and 90 degrees are byte-identical.

Raster (same task): xf_glyph takes the inner pixels of a coverage bitmap without the per-texel tests (the same sums in the same order: gfx_transform's turned texts stay byte-identical). Full screen of text redrawn each frame, CPU per frame minus the 12.3 ms of clear and frame hash, same build: a 48 px font under a matrix that only moves (the museum's old way) 8.9 ms before, 4.0 ms now; a 16 px font under a x3 matrix (the new way) 5.8 ms (it was 9.5 ms and blurred).
zinc:ui: a Text in a view with a scale of its own (style scale, transform, scale-* class) was drawn in the nearest font the program had for round(size x scale): with no font of that size, the letters kept their size while the layout grew (tests/data/text_scaled/ui: ssim 0.759 against the same Text set at twice the size, edge energy 47 %). lib/std/ui.ts now draws its lines through setTransform in the node's own font: same line breaks as without the transform (scene dump texts), ssim 0.994, edge energy 85 %. tests/golden/style-transform/frame.hash changed for that reason only (the labels of the two views scaled 1.5 were 16 px, are 24 px now; 982 pixels in the box 196,31-276,216). Text selection highlights and <input> in a scaled view are untouched (paintEdit keeps fontAtScale).
Decided alone: the ladder a quarter of an octave apart with the first size not below the one on screen (measured above); no font per exact size (a zoom would rasterize every visible glyph at each frame and fill the GL atlas); fonts made for scaled text are never freed, bounded by ZRT_SCALED_FONTS and by the ladder (17 sizes a family).
<!-- SECTION:NOTES:END -->
