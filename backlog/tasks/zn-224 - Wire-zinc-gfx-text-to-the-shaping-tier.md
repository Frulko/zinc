---
id: ZN-224
title: 'Wire zinc:gfx text to the shaping tier'
status: Done
assignee: []
created_date: '2026-10-07 10:55'
updated_date: '2026-10-08 02:35'
labels:
  - render
  - text
dependencies:
  - ZN-114
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-114 built src/text (HarfBuzz, SheenBidi, libunibreak, stb_truetype by glyph id) but zinc:gfx and zinc:ui still draw by codepoint (runtime/ttf.cpp). Add an opt-in path (profile / zinc.json option 'text: shaped', default on desktop-class targets, off on tiny profiles) so drawText, measureText and ui Text use layout(): wrapping at maxWidth, bidi, complex scripts, per-glyph cache keyed by gid. Latin-only apps on the tiny profile stay pixel-identical (tests/t2/examples_pixels.sh). The shaping libs are linked only when a program asks (AOT too).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 text in Arabic, Hebrew, Devanagari and a ZWJ emoji draws through zinc:gfx and zinc:ui Text, golden images
- [x] #2 Latin-only examples keep their prototype pixels with the tier off, and with it on within the tolerance policy
- [x] #3 AOT programs link the tier only when the option is set; binary size recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc.json "text": "shaped" (or ZINC_TEXT=shaped) installs zrt::raster::shape_hooks (runtime/zrt_raster.h, raster.cpp): text needing shaping (combining marks, Hebrew..Indic, ZWJ, Arabic forms, emoji) is laid out by src/text/layout.h over the embedded TTFs (assets/*.ttf = fallback chain) with glyph bitmaps cached by gid; used by drawText, textWidth and so zinc:ui Text. Goldens tests/golden/shaped (gfx) and shaped-ui (ui Text): Hebrew, Arabic, Devanagari, ZWJ family, combining mark. All 42 examples stay pixel-identical with ZINC_TEXT=shaped (Latin, symbols, CJK keep the tables). zinc build links the tier only with the option; shaped AOT 11,546,040 bytes vs 10,033,608 plain (+1.51 MB, hb_shape absent without it). D32. Not done: cross builds do not link it; line wrapping of ui Text still measures through the same hook (no bidi-aware wrap across lines). tests/t1/text_shaped.sh.
<!-- SECTION:NOTES:END -->
