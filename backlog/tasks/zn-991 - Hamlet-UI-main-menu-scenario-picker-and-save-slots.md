---
id: ZN-991
title: 'Hamlet UI: main menu, scenario picker and save slots'
status: Done
assignee: []
created_date: '2026-11-01 14:26'
updated_date: '2026-11-01 14:59'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 750080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A title screen with new city (seed, size, preset), load from slots with thumbnails, scenarios later, options and quit, in the pixel UI kit; the in-game menu has save, load, options, exit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Main menu starts a new city with seed and size or loads a slot
- [x] #2 Save slots store name, date and a thumbnail
- [x] #3 In-game menu offers save, load, options and exit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slot date is the village's game date (the interface reads no wall clock); the main menu opens at launch only when a saved village waits, so a first run and the tests go straight into the game.
<!-- SECTION:NOTES:END -->
