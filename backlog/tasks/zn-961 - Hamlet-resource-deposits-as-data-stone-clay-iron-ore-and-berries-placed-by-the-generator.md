---
id: ZN-961
title: >-
  Hamlet: resource deposits as data: stone, clay, iron ore and berries placed by
  the generator
status: Done
assignee: []
created_date: '2026-11-01 13:06'
updated_date: '2026-11-01 15:06'
labels:
  - hamlet
  - demo
  - m2
  - map
  - procedural
  - economy
  - size-S
milestone: m-30
dependencies:
  - ZN-960
  - ZN-942
ordinal: 720020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deposits are tile objects that a gatherer building can work (gather: 'deposit:stone'). Placement rule per resource in economy.json (near rocks, near water, etc.). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 economy.json: deposits[] {resource, placement, density, model}
- [x] #2 Generator places them; each preset keeps at least one of each required resource within reach of the gate (test over 50 seeds)
- [x] #3 Quarry building as the first user (stone resource) added purely in data plus a model
- [x] #4 Depleted deposits disappear and the static bake updates
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: economy.json deposits[] (resource, model, placement rock/water/tree/any, density, amount, required, active), gen/deposits.ts (rule scatter that never walls the gate off, a required kind is forced within LODE_REACH of the gate), deposits live in world.rock as ROCK_DEPOSIT + kind with world.lode the amount (4 art variants of the rock model: stone, clay, ore, berries), quarry (gather deposit:stone, quarryman role, model) as the first user, stone resource (wells cost it; start stock 2), PLACE_NO_LODE when none near, depletion clears the tile and bumps the revision, save H11 lists the deposits left. Clay, ore and berries are declared but active:false until a building works them (no unusable piles on the map). Test: 150 villages (50 seeds x sizes 12, 24, 32) always have a stone within reach; quarry mines one unit per trip until the deposit is gone.
<!-- SECTION:NOTES:END -->
