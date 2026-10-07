---
id: ZN-224
title: 'Wire zinc:gfx text to the shaping tier'
status: Backlog
assignee: []
created_date: '2026-10-07 10:55'
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
- [ ] #1 text in Arabic, Hebrew, Devanagari and a ZWJ emoji draws through zinc:gfx and zinc:ui Text, golden images
- [ ] #2 Latin-only examples keep their prototype pixels with the tier off, and with it on within the tolerance policy
- [ ] #3 AOT programs link the tier only when the option is set; binary size recorded
<!-- AC:END -->
