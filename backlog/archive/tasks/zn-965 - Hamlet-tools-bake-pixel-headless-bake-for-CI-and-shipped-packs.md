---
id: ZN-965
title: 'Hamlet: tools/bake-pixel: headless bake for CI and shipped packs'
status: Backlog
assignee: []
created_date: '2026-11-01 13:07'
labels:
  - hamlet
  - demo
  - m2
  - atlas
  - tools
  - size-S
milestone: m-30
dependencies:
  - ZN-964
ordinal: 720060
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Runs the demo headless with --bake out.bin (ZINC_HEADLESS=1) so tests and a later zinc pack step can ship the atlas; no new zinc subcommand now (decision in the roadmap). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/bake-pixel examples/hamlet writes the same bytes as the runtime cache for the same hash
- [ ] #2 A T1 test loads the tool's file and draws a frame equal to the runtime-baked frame
- [ ] #3 Tool refuses to run with a window (sets ZINC_BACKGROUND/HEADLESS)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: dropped. Atlas export tool exists through ZINC_HAMLET_ATLAS_DUMP; no separate tools/bake-pixel needed.
<!-- SECTION:NOTES:END -->
