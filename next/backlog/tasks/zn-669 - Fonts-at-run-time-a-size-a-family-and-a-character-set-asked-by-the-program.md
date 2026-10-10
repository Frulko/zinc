---
id: ZN-669
title: 'Fonts at run time: a size, a family and a character set asked by the program'
status: Backlog
assignee: []
created_date: '2026-10-10 18:52'
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
- [ ] #1 a program draws a text read at run time, in a font file named at run time, at a size computed at run time, with the same pixels as the same text baked (golden)
- [ ] #2 a character absent from the sources and the assets, typed through ZINC_INPUT text into a text field, draws its glyph
- [ ] #3 the cost of the first draw of a new size is measured; a program that never asks pays nothing (size and frame time unchanged)
<!-- AC:END -->
