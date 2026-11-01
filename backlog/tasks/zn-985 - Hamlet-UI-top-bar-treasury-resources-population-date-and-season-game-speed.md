---
id: ZN-985
title: >-
  Hamlet UI: top bar - treasury, resources, population, date and season, game
  speed
status: Done
assignee: []
created_date: '2026-11-01 14:24'
updated_date: '2026-11-01 14:55'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 744080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A top bar like Caesar's: coins and key resources with small icons, population and workers, the date and season, and speed buttons (pause, 1x, 2x, 3x) that scale the simulation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Top bar shows resources from the economy data with icons and a date and season clock
- [x] #2 Speed buttons pause and scale the simulation, kept in the save
- [x] #3 Numbers flash briefly when they change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Speed (and skin, sound, options) persist in their own storage key hamlet:prefs (ui/prefs.ts), not in the village save line: the save format belongs to the simulation.
<!-- SECTION:NOTES:END -->
