---
id: ZN-065
title: Map.get and find results of numbers and booleans outside ??
status: Done
assignee: []
created_date: '2026-10-06 22:49'
updated_date: '2026-10-07 00:26'
labels:
  - language
  - size-S
milestone: m-13
dependencies: []
ordinal: 40070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Z0005 rejects `m.get(k)` of number/boolean outside `??`, `as T` and console.log, and `arr.find(...)` outside `??`. Allow comparisons (`m.get(k) === undefined`, `!== null`), returns and assignments to `T | undefined` (represented as a nullable scalar: reuse the box representation of the Dyn work or add nullable scalar slots to the IR; decide and record in the decisions file). Used by pinball, chataigne, zed-editor tools.ts and gphoto2.sim.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures: get/find results compared, returned, stored in a `number | undefined` variable and narrowed by `if (v !== undefined)`
- [x] #2 examples/pinball/src/tools.ts, chataigne/src/link.ts and zed-editor tools compile past this check
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Map.get/find/at of scalars return V|null (D16), truthiness and ! of nullable number/boolean/refs through a generated test. The three example files no longer fail on Map.get/find; they still stop on zinc:osc and zinc:process members (other tasks).
<!-- SECTION:NOTES:END -->
