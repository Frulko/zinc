---
id: ZN-944
title: 'Hamlet: chain 1: lumberjack -> logs -> sawmill -> planks -> construction'
status: Backlog
assignee: []
created_date: '2026-11-01 13:00'
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
- [ ] #1 economy.json: resource log, plank; sawmill converts 2 log -> 1 plank in 6 s; lumberjack hut (new building) gathers trees; the sawmill no longer fells
- [ ] #2 House cost and others expressed in planks and logs; START stock lets the player build one hut and one sawmill
- [ ] #3 A scripted session in hamlet.sh: from the start stock the player reaches 5 planks without any other input than building (ratio of arrivals documented)
- [ ] #4 Existing saves with the H1 format load (wood -> planks conversion documented in the loader)
<!-- AC:END -->
