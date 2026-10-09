---
id: ZN-428
title: Bake only the fonts a program uses
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-09 10:22'
labels:
  - games
  - assets
  - size-S
  - perf
milestone: m-22
dependencies: []
ordinal: 5003
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bake the grid-font tables only when the program calls gfx.text. Subset the embedded TrueType files to the scanned characters with hb-subset (already vendored with HarfBuzz; linked into the CLI baker only), unless the project asks for shaped text. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 4.4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 game-2d resources.bin is at most 0.5 MB (1 706 441 B today)
- [ ] #2 tests/t0/res.sh and every pixel golden unchanged
- [ ] #3 a program calling gfx.text still draws the grid font
- [ ] #4 a "text": "shaped" project keeps whole fonts
<!-- AC:END -->
