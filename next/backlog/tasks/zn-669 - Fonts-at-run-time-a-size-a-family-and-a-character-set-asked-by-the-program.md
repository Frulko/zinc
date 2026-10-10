---
id: ZN-669
title: 'Fonts at run time: a size, a family and a character set asked by the program'
status: Done
assignee: []
created_date: '2026-10-10 18:52'
updated_date: '2026-10-10 20:29'
labels:
  - text
  - ui
  - size-M
milestone: m-27
dependencies: []
ordinal: 425410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum table (ZN-650.03): zinc:gfx bakes only the font sizes and families written as literals in the program and only the characters found in its sources and assets, so the table carries a ladder of 23 sizes and a constant holding the Latin-1 and Latin Extended-A characters, the `theme.font` of a project file is not honoured, and a character typed in an editor at run time may have no glyph. A program asks for a font file from its assets at any size, and text draws the characters it is given, rasterised on demand into the glyph cache (the baked subset stays the fast path and the only one on small devices).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program draws a text read at run time, in a font file named at run time, at a size computed at run time, with the same pixels as the same text baked (golden)
- [x] #2 a character absent from the sources and the assets, typed through ZINC_INPUT text into a text field, draws its glyph
- [x] #3 the cost of the first draw of a new size is measured; a program that never asks pays nothing (size and frame time unchanged)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (D78): runtime/ttf.cpp rasterizes glyphs with the baker's algorithm (8-segment quadratics, composite offset + x/y scale, 4x4 nonzero samples in doubles, fp-contract off), so a glyph rasterized at run time is the baked one; gfx.loadFont(file, px) (row host.gfxLoadFont, in kGfxModule's api part so QuickJS has it too; lib/gfx.d.ts, sim stub, prototype runtime): a baked family, the stem of an embedded file, or a .ttf of the assets read whole at run time (sys_host zn_asset_font -> raster::add_font_file); raster::text_font hands text a baked font lacks to its twin from the same file (drawText, textWidth, layout measure); fontAscent/lineHeight answer runtime fonts; a program whose own files have a text field (lowered JSX _el(7)/_el(8)/_onText(, TextInput(, startTextInput() embeds its fonts with every character. AC1: tests/t1/fonts_runtime.sh, main.ts reads file, size 18.4*1.25 and text from assets/card.json, PublicSans-Medium read from the assets at run time, frame identical to baked.ts (0 pixels differ), interpreted and compiled (and QuickJS by hand). AC2: Greek and Cyrillic typed through ZINC_INPUT text into a zinc:ui input draw (golden tests/golden/fonts-runtime/typed.png). AC3: first measure of 37 glyphs 0.45-0.5 ms at 14 px, 0.6-0.74 ms at 24, 1.2-1.4 ms at 48, 3.1 ms at 96, then 1-2 us; against a build of c5b2a283: resources of bouncing-ball, breakout, nuxt-ui, museum-table, text, zinc3d_aa byte-identical, bouncing-ball AOT +24 bytes, b3-text work p50 0.11 vs 0.11-0.12 ms; programs with fields +366/+387 KB (hero, forms). scale_push re-recorded (only its text line differs, up to 35 levels). Fixed on the way (separate commits): QuickJS zinc:gfx lacked openWindow since ZN-663 (c5b2a283), the dev bundle lacked libzn_window since ZN-592.01 (6d9e41c0), gphoto2's weak fallbacks shadowed zinc's runtime images since ZN-592.01 (fe72e52a), stale goldens/tests after 0e65f021 and ZN-592.06/617 (host_direct, system_sim, text_shaped, verbose_log). T1 after ZN-663 + fixes: 286 passed; remaining failures known (tls, three_3d, video, webgl_conformance, macos_window, macos_vibrancy). usage: n/a
<!-- SECTION:NOTES:END -->
