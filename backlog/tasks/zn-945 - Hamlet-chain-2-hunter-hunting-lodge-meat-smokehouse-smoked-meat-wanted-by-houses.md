---
id: ZN-945
title: >-
  Hamlet: chain 2: hunter -> hunting lodge -> meat -> smokehouse -> smoked meat,
  wanted by houses
status: Done
assignee: []
created_date: '2026-11-01 13:00'
updated_date: '2026-11-01 14:41'
labels:
  - hamlet
  - demo
  - m1
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-943
ordinal: 700060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second chain of the first set. Houses past the free settlers want smoked meat instead of raw meat. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 economy.json: resources meat, hide, smoked_meat; hunting lodge outputs meat+hide; smokehouse converts meat -> smoked_meat (needs 1 log of fuel)
- [x] #2 Smokehouse model in view/models.ts, lit volumes, same style (no flat sprite), shown in the toolbar from the data
- [x] #3 House settlers beyond FREE_SETTLERS consume smoked_meat (rule in the house def: consumes{smoked_meat:1 per settler})
- [x] #4 Rules test: lodge + smokehouse + house reach a settled household; missing fuel stops the smokehouse and the hint data says why
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chain 2: lodge -> meat + hide, smokehouse (2 meat + 1 log fuel -> 2 smoked meat, 8 s), houses past the 4 free settlers eat smoked meat or fish. Measured: 400 s with 3 houses, lodge, smokehouse from the start stock: 6 inhabitants, 40 smoked meat, 20 hides. Without fuel the smokehouse waits (state + waitFor) and the advice line says so.
<!-- SECTION:NOTES:END -->
