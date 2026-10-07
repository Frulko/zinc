---
id: ZN-225
title: 'Font fallback chain, system fonts and colour emoji'
status: Backlog
assignee: []
created_date: '2026-10-07 10:55'
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
- [ ] #1 an app with no emoji font of its own shows colour emoji from the system font on desktop
- [ ] #2 OpenType CFF fonts render
- [ ] #3 decision recorded in docs/reports/zinc-next-decisions.md (FreeType or not, system fonts policy)
<!-- AC:END -->
