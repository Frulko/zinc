---
id: ZN-114
title: >-
  Text shaping tier: HarfBuzz, SheenBidi, libunibreak; stb_truetype for the tiny
  profile
status: Backlog
assignee: []
created_date: '2026-10-06 22:57'
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
- [ ] #1 fixtures: kerning pairs, Arabic and Hebrew bidi, Devanagari, ZWJ emoji, line breaking in CJK; each equals a stored PNG
- [ ] #2 an app that sets text with Latin-only fonts has the same pixels as before on the tiny profile (exact)
- [ ] #3 binary size and startup cost recorded; the shaping tier is linked only by programs that ask for it
<!-- AC:END -->
