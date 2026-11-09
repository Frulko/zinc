---
id: ZN-1062
title: 'Text: tabular figures through HarfBuzz'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:42'
updated_date: '2026-11-09 03:11'
labels:
  - text
  - size-M
milestone: m-17
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Engine-level OpenType tnum so any text can ask for fixed-width digits (clocks, tables).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Fonts: an engine-level tabular-figures feature (OpenType tnum through HarfBuzz in src/text/layout.cpp, chosen per font like the size) so any text can ask for fixed-width digits; Musique draws its clock digit by digit meanwhile (examples/music/src/ui.ts tabular).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A text style asks for tabular figures through src/text/layout.cpp; a test of equal digit advances
- [x] #2 Musique draws its clock without the digit-by-digit workaround
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. One OpenType feature, tnum, carried by the font id like the size: a runtime font asked as "Name~t" (beside "Name~i") is tabular.

How it works
- src/text/layout: Options.tabular passes hb_feature tnum (global range) to hb_shape. layout_test checks equal digit advances with it and Inter's narrower 1 without it (T0 text_layout).
- runtime/ttf.cpp: RFont.tabular; from_file parses the ~i/~t marks in any order and never returns a baked font for ~t (baked tables have the default figures). Its glyph table takes each code point's glyph from a new hook, ShapeHooks.tabular_glyph (src/text/shaped_gfx.cpp: the code point shaped alone with and without tnum, the tnum glyph when they differ, advance from hmtx of that glyph). So measuring (text_advance), the software raster, the GL replay's atlas (keyed by font id, a tabular font is its own id) and the shaped path all see the same glyphs. In Inter, tnum also swaps the colon and the space.
- Shaped text (a fallback glyph in the string): shaped_gfx passes o.tabular from font_tabular(font); the shaped-run cache key carries ":t:" so the two styles never share runs. Glyph bitmaps are keyed by glyph id, which differs.
- src/res/res.cpp subsetTtf: the baker dropped GSUB from the embedded files, so tnum had no lookups at run time. GSUB is kept with one layout feature, tnum (hb_subset_input_set LAYOUT_FEATURE_TAG); default shaping is unchanged (text_fallback frame hash still passes), measured +2.4 KB on the bake of tests/golden/res (929545 -> 931961 bytes, three embedded files).
- font_name(id) gives the name with its marks; gfx.cpp phys_font (pixel scale > 1) and scaled_font (zoom ladder) use it, so a tabular (and a slanted runtime) font stays one at every scale: phys_font dropped ~i before.
- gfx.cpp loadFont keeps the marks on the stem (fonts/Lora.ttf~t -> Lora~t); gfx_host reads the asset file without the marks.

API
- zinc:gfx tabularFont(family, px) (modules.cpp TS over host.gfxLoadFont, so the interpreter, AOT and QuickJS share it; no new builtin). lib/gfx.d.ts, docs/reference/gfx.md, cheatsheet regenerated.
- zinc:ui: classes tabular-nums / normal-nums (Tailwind's names; inherited by nested Text like italic). UiNode.tabular; familyFace/faceIn take it; faceNamed() asks tabularFont, else the baked face. Frontend validClass accepts both. React Native fontVariant was not parsed anywhere; not added (later.md line).
- Musique: the digit-by-digit tabular()/tabularWidth() removed; HUGE = tabularFont('sans-bold', 250), F.smallNum / F.smallBNum for the status-bar time and battery level, drawn with drawText/centered.

A font without tnum: HarfBuzz ignores a feature the font lacks, so the tabular glyph equals the plain one, tabular_glyph returns 0 and the font draws its own figures (DejaVu and JetBrains Mono already have equal-width digits). Where the shaping tier is not linked ("text": "simple", small boards) there is no hook: tabularFont gives the font with its default figures (on boards without TrueType files, the nearest baked size).

Decisions
- Feature carried by the font id (a mark on the name, like ~i), not a per-call flag: one cache key per font, nothing new in the command stream, the GL atlas and every measure path follow without change.
- Glyph tables fed by a HarfBuzz single-code-point lookup instead of sending tabular text through the shaper: the codepoint path stays fast and the GL replay (which does not shape) agrees.
- Named function tabularFont over a boolean third argument to font(): reads at the call site, and font() means "nearest baked" while a tabular face is exact-size from the TrueType file.

Proven: tests/run --only text_layout, text_fallback, emoji_text, res_subset, ui_class_parser, text_tabular (new T0: interpreter + QuickJS). Probe: textWidth of '0' '1' '7' all 25.86 with tabularFont('sans-bold', 40) vs 26.97/17.25/23.27 plain, equal on interpreter, --native and QuickJS. zinc:ui probe shot: 11:11 and 00:00 same box width with tabular-nums. Musique: zinc check ok, headless 20 frames with ZINC_SHOT: status bar time and battery level drawn.

Research (sonnet sub-agent, 2026-11-09)
- HarfBuzz features: https://harfbuzz.github.io/shaping-opentype-features.html (hb_feature_from_string "tnum", global start/end; features key the cached shape plan).
- CSS font-variant-numeric: https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric ; Tailwind tabular-nums: https://tailwindcss.com/docs/font-variant-numeric
- React Native fontVariant ['tabular-nums']: https://reactnative.dev/docs/text-style-props (issue https://github.com/facebook/react-native/issues/54823)
- Flutter FontFeature.tabularFigures() = 'tnum' in TextStyle.fontFeatures; SkParagraph TextStyle::addFontFeature; its paragraph cache keys on the whole style, features included (the pitfall the shaped-run key here avoids).
- Inter: proportional figures by default, tnum opt-in: https://rsms.me/inter/

Proposed tests
- tests/run --only text_tabular on AOT too (zinc build of tests/data/text_tabular, same output): proves the built program links the hook; ~40 s, ~1 GB (C++ compile).
- A frame hash of Musique's digital clock face at two times (11:11, 00:00) headless: proves the clock keeps its place; ~5 s, ~300 MB.
- GL replay pixel check of a tabular text (ZINC_RENDER gl, headless): proves the atlas draws the tnum glyphs; ~5 s, ~300 MB.
<!-- SECTION:NOTES:END -->
