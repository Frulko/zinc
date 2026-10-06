---
id: ZN-065
title: Map.get and find results of numbers and booleans outside ??
status: Backlog
assignee: []
created_date: '2026-10-06 22:49'
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
- [ ] #1 fixtures: get/find results compared, returned, stored in a `number | undefined` variable and narrowed by `if (v !== undefined)`
- [ ] #2 examples/pinball/src/tools.ts, chataigne/src/link.ts and zed-editor tools compile past this check
<!-- AC:END -->
