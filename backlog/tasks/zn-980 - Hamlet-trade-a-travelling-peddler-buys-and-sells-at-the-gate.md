---
id: ZN-980
title: 'Hamlet: trade: a travelling peddler buys and sells at the gate'
status: Done
assignee: []
created_date: '2026-11-01 13:13'
updated_date: '2026-11-01 15:10'
labels:
  - hamlet
  - demo
  - m3
  - progression
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-943
  - ZN-970
ordinal: 740070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Single-player trade as data (offers by day, price in coins). It is the offline form of the later player trade. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 coin resource and a peddler visit every N days with 2-3 offers from a table
- [x] #2 Buying/selling is a command (replays); offers are seeded
- [x] #3 Offer list shown in a small panel; test over 20 days with a fixed seed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: coin resource (the village starts with 12), economy.json trade (everyDays, stayDays, offers, table of sell/buy lines), engine/trade.ts (the peddler comes every 5 days for 2: a person at the gate, 3 distinct offers drawn with the world PRNG, prices wander 10% around the resource price), rules/trade.ts (offerLines() plain words for the panel, canTrade, applyTrade), the trade command (issue('trade', offer index): logged, replayable, refused when taken twice or without coins/goods); save H13 stores the offers and the days left. UI: the small panel itself is the UI agent's: it draws offerLines() and calls issue('trade', k) on a click; the peddler runs only when world.progression is on. Test: rules.ts trade block over 20 days (visits on days 5, 10, 15, 20, determinism, command, save).
<!-- SECTION:NOTES:END -->
