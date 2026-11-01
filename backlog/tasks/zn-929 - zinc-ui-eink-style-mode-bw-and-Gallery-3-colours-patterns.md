---
id: ZN-929
title: 'zinc:ui: eink style mode (b&w and Gallery 3 colours, patterns)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
updated_date: '2026-11-01 13:21'
labels:
  - ui
  - rmpp
  - size-M
milestone: m-29
dependencies: []
ordinal: 623460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With capabilities.eink (or ZINC_EINK=1 on the Mac) tokens snap to black/white plus Gallery 3 primaries, gradients/shadows/opacity are disabled, and a Pattern fill (hatch, dots, stripes) replaces tints. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A style test shows no gradient or alpha command in the frame dump
- [x] #2 A golden of a card with patterns on the emulator
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Style mode in lib/std/ui.ts: EINK (capabilities eink or ZINC_EINK=1) wraps the gfx draw calls: colours snap to black/white/Gallery 3 primaries (greys go to black or white), alpha under half is dropped, others opaque, shadow dropped, gradient is its first stop, opacity ignored. Classes pattern-hatch|cross|dots|stripes. Test: tests/t1/eink_style.sh (golden tests/golden/eink-card; the frame dump is the counter einkDroppedCount plus the hash, there is no gradient/alpha path left in the mode). Non-eink output unchanged (ui_cmds, style_shadow, style_gradient pass).
<!-- SECTION:NOTES:END -->
