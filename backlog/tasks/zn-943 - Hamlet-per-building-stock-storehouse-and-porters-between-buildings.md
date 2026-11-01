---
id: ZN-943
title: 'Hamlet: per-building stock, storehouse and porters between buildings'
status: Done
assignee: []
created_date: '2026-11-01 13:00'
updated_date: '2026-11-01 14:37'
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
- [x] #1 Building has stock{} with a per-resource cap from the def; a full producer stops (state 'full')
- [x] #2 Storehouse building type added in the JSON: accepts every resource, models.ts has its model
- [x] #3 A porter job exists: reserves a load, walks the road path, delivers, never duplicates a load (test: 2 producers, 1 store, totals conserved over 600 ticks)
- [x] #4 World totals shown by the HUD are the sum of stores (HUD resource line generated from the resource list)
- [x] #5 Reachability: a building not connected by road to a store does not export (hint data exposed for the indicators task)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stores: the hall (a free storehouse by the gate, holds the start stock), storehouse buildings, porters (hired after producers, taken back by a lacking producer), self-hauling workers, reserved/incoming loads, road components for reachability (BS_ISOLATED). Save H7. World totals are recounted from stores. view/frame.ts needs a CHIMNEY entry per building type (one line committed there).
<!-- SECTION:NOTES:END -->
