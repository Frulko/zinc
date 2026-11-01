---
id: ZN-979
title: 'Hamlet: goals and progression as data: unlock buildings, scenario targets'
status: Backlog
assignee: []
created_date: '2026-11-01 13:13'
labels:
  - hamlet
  - demo
  - m3
  - progression
  - size-M
milestone: m-30
dependencies:
  - ZN-970
  - ZN-944
ordinal: 740060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Settlers Online-like progression: goals.json with conditions (population, stock, building present) and rewards (unlock building, stock, reveal region). Tutorial goals teach the first chain. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goal conditions evaluated in a daily slice; reward applied via a command (so it replays)
- [ ] #2 Locked buildings are greyed in the toolbar with the goal that unlocks them
- [ ] #3 Save H2 stores goal progress
- [ ] #4 A tutorial goal chain for wood -> planks -> house
<!-- AC:END -->
