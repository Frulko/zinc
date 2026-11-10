---
id: ZN-1068
title: 'Hamlet follow-ups: atlas test and sprite rects'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:43'
labels:
  - hamlet
  - size-S
milestone: m-30
dependencies: []
ordinal: 15200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A failing test on develop and a measured optimisation.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-hamlet-rects: tight per-kind sprite rects for the idle frame (animals, people) from the atlas frame bounds, with a coverage test; measure on AOT and interpreter at 24/64/96 (a disjoint cover was +5% on AOT).
- ZN-hamlet-quiet: Hamlet windowed Metal and QuickJS fluidity numbers on a quiet machine.
- ZN-hamlet-atlas-deer: `hamlet_atlas` deer stamps differ from live deer (1670 pixels) on develop; not from the fluidity pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hamlet_atlas deer stamps match live deer
- [ ] #2 Tight per-kind sprite rects with a coverage test; numbers on AOT and interpreter at 24/64/96
<!-- AC:END -->
