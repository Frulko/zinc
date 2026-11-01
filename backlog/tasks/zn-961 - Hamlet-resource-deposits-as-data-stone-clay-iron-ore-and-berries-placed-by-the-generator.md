---
id: ZN-961
title: >-
  Hamlet: resource deposits as data: stone, clay, iron ore and berries placed by
  the generator
status: Backlog
assignee: []
created_date: '2026-11-01 13:06'
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
- [ ] #1 economy.json: deposits[] {resource, placement, density, model}
- [ ] #2 Generator places them; each preset keeps at least one of each required resource within reach of the gate (test over 50 seeds)
- [ ] #3 Quarry building as the first user (stone resource) added purely in data plus a model
- [ ] #4 Depleted deposits disappear and the static bake updates
<!-- AC:END -->
