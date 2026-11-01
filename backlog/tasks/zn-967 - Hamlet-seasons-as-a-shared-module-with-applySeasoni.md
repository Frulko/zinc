---
id: ZN-967
title: 'Hamlet: seasons as a shared module with applySeason(i)'
status: Backlog
assignee: []
created_date: '2026-11-01 13:08'
labels:
  - hamlet
  - demo
  - m2
  - pixel-plays
  - reuse
  - size-M
milestone: m-30
dependencies:
  - ZN-951
  - ZN-955
ordinal: 720080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
river/seasons.ts moves beside the renderer with one applySeason that sets lighting, vegetation, water and soil, clears ramps and invalidates the atlas. Hamlet gets a season clock (one season per N minutes, save keeps it). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 applySeason(i) used by river and hamlet; river goldens unchanged
- [ ] #2 Hamlet cycles four seasons; atlas and static bake re-done on change without stalling a frame (sliced)
- [ ] #3 Ambience ids are data in the season table, not river-specific
- [ ] #4 Save H2 stores the season clock
<!-- AC:END -->
