---
id: ZN-943
title: 'Hamlet: per-building stock, storehouse and porters between buildings'
status: Backlog
assignee: []
created_date: '2026-11-01 13:00'
labels:
  - hamlet
  - demo
  - m1
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-942
ordinal: 700040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resources move along roads: a producer holds outputs, a porter (an idle resident) carries a batch to the nearest accepting building or storehouse; a consumer pulls inputs. Idea only from Caesar III (carts, stores that reserve incoming loads), no code copied. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Building has stock{} with a per-resource cap from the def; a full producer stops (state 'full')
- [ ] #2 Storehouse building type added in the JSON: accepts every resource, models.ts has its model
- [ ] #3 A porter job exists: reserves a load, walks the road path, delivers, never duplicates a load (test: 2 producers, 1 store, totals conserved over 600 ticks)
- [ ] #4 World totals shown by the HUD are the sum of stores (HUD resource line generated from the resource list)
- [ ] #5 Reachability: a building not connected by road to a store does not export (hint data exposed for the indicators task)
<!-- AC:END -->
