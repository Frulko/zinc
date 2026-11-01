---
id: ZN-987
title: >-
  Hamlet UI: advisor screens - labour, food, housing, trade and population
  overview
status: Done
assignee: []
created_date: '2026-11-01 14:25'
updated_date: '2026-11-01 15:01'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-L
milestone: m-30
dependencies: []
ordinal: 746080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modal advisor windows in the spirit of Caesar's advisors: a labour table (jobs, workers, priorities), food and storage, housing levels and what is missing, trade prices, population history chart. Built from the economy and housing data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 At least labour, food and housing advisors open from the column and read live data
- [x] #2 The labour advisor lets the player change worker priorities
- [x] #3 A population chart draws the last years
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Population history is kept in memory (one sample a month, 36 shown), not saved. Minimap ground is now one cached image; zinc.json sets growDrawCommands for busy UI frames.
<!-- SECTION:NOTES:END -->
