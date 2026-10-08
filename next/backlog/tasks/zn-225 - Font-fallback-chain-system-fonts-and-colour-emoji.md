---
id: ZN-225
title: 'Font fallback chain, system fonts and colour emoji'
status: Done
assignee: []
created_date: '2026-10-07 10:55'
updated_date: '2026-10-08 08:45'
labels:
  - render
  - text
dependencies:
  - ZN-114
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-114: fallback list per app (zinc.json fonts) plus system fonts found at run time (macOS CoreText font list, fontconfig on Linux, none on tiny profiles; decide how to bake or load them), CFF/OpenType outlines (stb_truetype handles glyf only: evaluate FreeType or a CFF path), colour emoji (COLR/CPAL, sbix, CBDT) and variation-selector emoji presentation, variable-font instances (wght/wdth) applied through HarfBuzz.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 an app with no emoji font of its own shows colour emoji from the system font on desktop
- [x] #2 OpenType CFF fonts render
- [x] #3 decision recorded in docs/reports/zinc-next-decisions.md (FreeType or not, system fonts policy)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC1 (macOS verified): with text shaped, code points no embedded font covers, or an emoji presentation selector, load the system fallback list (Apple Color Emoji.ttc: sbix PNG strikes decoded and box-scaled, drawn as colour glyphs through ShapedGlyph.rgba); tests/golden/shaped-emoji (skipped where the system font is absent). AC2: CFF fonts: baker accepts OTTO fonts, stb_truetype rasterises them: tests/golden/shaped-cff. AC3: D33 (no FreeType, system font list, sbix only). Not done: COLR/CPAL and CBDT colour fonts (Linux emoji), variable-font instances, fontconfig/CoreText enumeration; Linux fallback list unverified (no Linux here). Status Review because the Linux half is untested.
<!-- SECTION:NOTES:END -->
