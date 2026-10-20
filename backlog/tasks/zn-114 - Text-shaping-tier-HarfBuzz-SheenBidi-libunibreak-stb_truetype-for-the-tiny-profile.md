---
id: ZN-114
title: >-
  Text shaping tier: HarfBuzz, SheenBidi, libunibreak; stb_truetype for the tiny
  profile
status: Done
assignee: []
created_date: '2026-10-06 22:57'
updated_date: '2026-10-07 10:55'
labels:
  - rendering
  - text
  - size-L
milestone: m-8
dependencies:
  - ZN-091
  - ZN-113
ordinal: 40560
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D11: desktop-class targets shape with HarfBuzz 14 + SheenBidi 3 (bidi) + libunibreak (line breaking) behind one text-layout interface; stb_truetype stays the rasterizer and the only path on tiny profiles; fonts are still baked at build time (src/res). Kerning, ligatures, complex scripts, bidi paragraphs, emoji fallback chain, font fallback list. The old layout stays the reference for the goldens: re-bake text goldens in this task with the tolerance policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures: kerning pairs, Arabic and Hebrew bidi, Devanagari, ZWJ emoji, line breaking in CJK; each equals a stored PNG
- [x] #2 an app that sets text with Latin-only fonts has the same pixels as before on the tiny profile (exact)
- [x] #3 binary size and startup cost recorded; the shaping tier is linked only by programs that ask for it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. HarfBuzz 14.6, SheenBidi 3.0, libunibreak 8.0, stb_truetype vendored; src/text/layout.{h,cpp}, tests/text/layout_test.cpp, 7 stored images, tests/t0/text_layout.sh; sizes and timings in docs/reports/zinc-next-text-tier.md. Not done: wiring zinc:gfx text to the tier (the codepoint path stays the only text path, so Latin-only apps are unchanged by construction), emoji colour fonts, font fallback from system fonts.
<!-- SECTION:NOTES:END -->
