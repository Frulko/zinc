---
id: ZN-945
title: >-
  Hamlet: chain 2: hunter -> hunting lodge -> meat -> smokehouse -> smoked meat,
  wanted by houses
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
  - ZN-943
ordinal: 700060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second chain of the first set. Houses past the free settlers want smoked meat instead of raw meat. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 economy.json: resources meat, hide, smoked_meat; hunting lodge outputs meat+hide; smokehouse converts meat -> smoked_meat (needs 1 log of fuel)
- [ ] #2 Smokehouse model in view/models.ts, lit volumes, same style (no flat sprite), shown in the toolbar from the data
- [ ] #3 House settlers beyond FREE_SETTLERS consume smoked_meat (rule in the house def: consumes{smoked_meat:1 per settler})
- [ ] #4 Rules test: lodge + smokehouse + house reach a settled household; missing fuel stops the smokehouse and the hint data says why
<!-- AC:END -->
