---
id: ZN-976
title: >-
  Hamlet: services by roaming walkers and a market (coverage counters that
  decay)
status: Done
assignee: []
created_date: '2026-11-01 13:12'
updated_date: '2026-11-01 14:53'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-943
  - ZN-974
ordinal: 740030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A service walker leaves its building, roams roads in a bounded random walk and sets a per-house counter that decays each day; covered = counter > 0. Market restocks house food from a store. Mechanism only, re-invented. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Market building and walker in data + model; house has serviceCounter[]
- [x] #2 Counters decay per game day; uncovered houses are flagged by hints
- [x] #3 Test: coverage over a fixed road layout is deterministic (hash)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: economy.json services[] and a building 'service' ({id, walker, range} or {id, radius}); engine/services.ts (random-walk roam over roads on the world PRNG, coverAround, dailyServices); engine/day.ts is the daily slice (DAY_TICKS = 20 s) run from stepWorld; house Building.cover[] counters (save H9, state hash); market building + model + vendor role; hint no_service:<id> for a house outside the reach of a service the village offers; roles vendor/tanner/quarryman/peddler and a palette table in view/actors.ts. view/frame.ts got a two-line guard (type >= CHIMNEY.length) so building types without a chimney do not crash the smoke pass. Test: rules.ts services block (coverage, off-road house hint, determinism by covers+state hash, decay). Note: the 'without fuel' advice check of rules.ts fails against the uncommitted hud.ts of the UI agent (adviceLine now speaks hints), not from this change. Food restock by the market is part of the housing task (daily meals need market cover).
<!-- SECTION:NOTES:END -->
