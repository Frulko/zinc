---
id: ZN-942
title: >-
  Hamlet: generic job engine: gather, process and deliver driven by the building
  definition
status: Backlog
assignee: []
created_date: '2026-11-01 12:59'
labels:
  - hamlet
  - demo
  - m1
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-941
ordinal: 700030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the lumberjack and hunter state machines of villagers.ts by one engine reading the building def: a worker goes to its gather target (tree, deer, deposit) or waits for inputs, works for def.seconds, and produces the output. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A worker of any building type runs: idle -> fetch input or go to target -> work -> carry output -> deliver
- [ ] #2 Lumberjack and hunter behave as before (same arrivals, wood and game counts) with the generic engine; tests/data/hamlet/rules.ts passes on the 3 engines
- [ ] #3 A building whose inputs are missing shows state 'waiting' (field on Building) without blocking its worker forever (worker returns idle after a timeout)
- [ ] #4 No building-type switch remains in engine/villagers.ts except in drawing code
<!-- AC:END -->
