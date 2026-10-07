# Text-shaping tier (ZN-114, decision D11)

`src/text/layout.h`: `layout(faces, utf8, Options) -> lines` of runs of glyph ids with pen advances, `breakOpportunities`, `rasterize(face, gid, px)`.

- HarfBuzz 14.6 shapes (kerning, joining forms, Indic conjuncts, ZWJ ligatures); SheenBidi 3 gives the levels of each paragraph (UAX #9) and the pieces of a line are reordered by rule L2; libunibreak 8 gives the break opportunities (UAX #14, `lang` tailors CJK). A character takes the first face of the fallback list that has its glyph; spaces, punctuation and marks stay with the face of the text before them (same direction level), so runs do not split on a script change.
- stb_truetype rasterises by glyph id (TrueType `glyf` outlines; CFF fonts are not handled by it).
- Not linked by default: `zn_text` is a separate static library; `zinc` and the AOT programs do not contain it (`tests/t0/text_layout.sh` checks the symbols). The codepoint path of `runtime/ttf.cpp` stays the only text path, so an app with Latin-only fonts has the same pixels as before (the prototype pixel goldens, `tests/t2/examples_pixels.sh`, still apply). Wiring `zinc:gfx` text to the tier for programs that ask is a later task.
- Fixtures (`tests/text/layout_test.cpp`, images in `tests/golden/text/`): kerning (Inter), Arabic (Noto Sans Arabic), Hebrew between Latin words, Devanagari, a ZWJ family emoji (Noto Emoji: one glyph), CJK wrapping with `lang` ja (no line starts with the full stop; the font has no CJK glyphs, the images show its .notdef boxes), Latin wrapping. Fonts: `tests/data/fonts/` (OFL, licence files beside them).

Cost (arm64, -O2): `libzn_harfbuzz.a` 1.6 MB, SheenBidi 91 KB, libunibreak 103 KB, the layer 46 KB; a test program that links all of it is 1.6 MB, `zinc` is unchanged at 5.9 MB. Opening a face 0.17 ms, first layout 0.56 ms, a 1800-character paragraph wrapped at 400 px 0.27 ms. Harfbuzz compiles in 18 s (once, in the build directory).
