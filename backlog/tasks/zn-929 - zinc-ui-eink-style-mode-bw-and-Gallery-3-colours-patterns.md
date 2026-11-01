---
id: ZN-929
title: 'zinc:ui: eink style mode (b&w and Gallery 3 colours, patterns)'
status: Backlog
assignee: []
created_date: '2026-11-01 12:11'
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
- [ ] #1 A style test shows no gradient or alpha command in the frame dump
- [ ] #2 A golden of a card with patterns on the emulator
<!-- AC:END -->
