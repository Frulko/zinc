---
id: ZN-978
title: 'Hamlet: desirability map: trees and water raise it, industry lowers it'
status: Done
assignee: []
created_date: '2026-11-01 13:12'
updated_date: '2026-11-01 14:59'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-S
milestone: m-30
dependencies:
  - ZN-977
ordinal: 740050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A small grid built from rings around buildings feeds the housing evolve threshold. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Ring definitions in data; grid recomputed in a daily slice, not per tick
- [x] #2 Overlay toggle draws it as tinted dots in the view
- [x] #3 Test with a constructed layout
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: economy.json desirability (terrain sources tree/water/rock as rings, limit) and a per-building appeal ring list; rules/appeal.ts computeAppeal (daily slice, before the houses read it; restore recomputes), appealTiles for the UI; view/overlay.ts draws green/red dots when settings.appeal is on (two lines in view/frame.ts, one flag in settings.ts: the key/button that flips it belongs to the UI agent). Test: rules.ts desirability block; the housing test now gets its appeal from three real trees.
<!-- SECTION:NOTES:END -->
