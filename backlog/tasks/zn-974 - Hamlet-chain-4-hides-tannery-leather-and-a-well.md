---
id: ZN-974
title: 'Hamlet: chain 4: hides -> tannery -> leather, and a well'
status: Done
assignee: []
created_date: '2026-11-01 13:11'
updated_date: '2026-11-01 14:56'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-S
milestone: m-30
dependencies:
  - ZN-945
ordinal: 740010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Uses the hide from the lodge. The well is a service building by radius. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tannery and well in data and models; leather is a sellable and a building input of the market stall
- [x] #2 Well covers houses within a radius (data: radius), flag shown by the hint system when a house lacks water
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: resource leather and a price on every resource (trade, ZN-980); tannery (hides -> leather) and well (service water, radius 4, no road needed) in economy.json with models; the market stall now costs 1 leather (the village starts with 1, so the first market stands before a tannery); hint no_service:water for a house outside the well's reach once a well stands. Test: rules.ts chain 4 block.
<!-- SECTION:NOTES:END -->
