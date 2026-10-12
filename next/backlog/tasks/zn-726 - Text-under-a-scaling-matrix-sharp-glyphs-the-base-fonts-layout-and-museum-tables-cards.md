---
id: ZN-726
title: >-
  Text under a scaling matrix: sharp glyphs, the base font's layout (and
  museum-table's cards)
status: Ready
assignee: []
created_date: '2026-10-12 12:31'
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
- [ ] #1 A TEXT drawn through a matrix that scales is set with glyphs made for its size on screen (a size step and a residual scale, the glyph cache bounded), its advances those of the base font times the scale: the width of a line is the base width times the scale within a pixel, at every scale from 0.5 to 4
- [ ] #2 Without a matrix, and under a matrix that only turns or flips, the frames are the ones of today (the goldens that cover text and transforms pass unchanged)
- [ ] #3 The software raster and the GL replay agree on such a text within the tolerance they have today (tests/t1/gfx_transform.sh or a new case), and an enlarged text is as sharp as the same text set directly at that size (a measured comparison, tools/pngdiff --ssim or --mae)
- [ ] #4 zinc:ui: a Text inside a view with a scale transform keeps its line breaks and is sharp; a case in the tests says so
- [ ] #5 museum-table wraps the texts of a card once, at the designed size, and draws the card through one matrix that holds its angle and its zoom: in a scripted zoom of a text card and of a notice from 1 to 3 over 60 frames no line changes its break (a test compares the lines), and the frame time of that session is not above today's
- [ ] #6 docs: the behaviour in docs/ui.md or the zinc:gfx reference, D71's limit updated in the task notes for the coordinator
<!-- AC:END -->
