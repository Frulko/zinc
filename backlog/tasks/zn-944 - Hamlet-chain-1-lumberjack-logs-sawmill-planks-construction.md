---
id: ZN-944
title: 'Hamlet: chain 1: lumberjack -> logs -> sawmill -> planks -> construction'
status: Done
assignee: []
created_date: '2026-11-01 13:00'
updated_date: '2026-11-01 14:40'
labels:
  - hamlet
  - demo
  - m1
  - economy
  - size-S
milestone: m-30
dependencies:
  - ZN-943
ordinal: 700050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wood becomes two resources: logs (felled) and planks (sawmill). Construction costs planks (and logs for the first buildings so the start stays winnable). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 economy.json: resource log, plank; sawmill converts 2 log -> 1 plank in 6 s; lumberjack hut (new building) gathers trees; the sawmill no longer fells
- [x] #2 House cost and others expressed in planks and logs; START stock lets the player build one hut and one sawmill
- [x] #3 A scripted session in hamlet.sh: from the start stock the player reaches 5 planks without any other input than building (ratio of arrivals documented)
- [x] #4 Existing saves with the H1 format load (wood -> planks conversion documented in the loader)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chain 1: logs (lumberhut) -> sawmill (2 log -> 1 plank, 6 s) -> planks pay construction. Start stock 20 logs + 10 planks. Measured headless (tests/data/hamlet/rules.ts): from the start stock, 2 houses + hut + sawmill give 16 planks and 27 felled trees after 150 s (about 1 plank per 9 s). Saves: H4 and older are refused cleanly since ZN-939 (the generator changed), so no wood->planks loader exists.
<!-- SECTION:NOTES:END -->
