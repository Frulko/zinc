---
id: ZN-1062
title: 'Text: tabular figures through HarfBuzz'
status: Backlog
assignee: []
created_date: '2026-11-07 16:42'
labels:
  - text
  - size-M
milestone: m-17
dependencies: []
ordinal: 1054000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Engine-level OpenType tnum so any text can ask for fixed-width digits (clocks, tables).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Fonts: an engine-level tabular-figures feature (OpenType tnum through HarfBuzz in src/text/layout.cpp, chosen per font like the size) so any text can ask for fixed-width digits; Musique draws its clock digit by digit meanwhile (examples/music/src/ui.ts tabular).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A text style asks for tabular figures through src/text/layout.cpp; a test of equal digit advances
- [ ] #2 Musique draws its clock without the digit-by-digit workaround
<!-- AC:END -->
