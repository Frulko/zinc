---
id: ZN-585
title: Raspberry Pi 4/5 and Pi 3 numbers for the four JS game demos
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-577
  - ZN-578
  - ZN-579
  - ZN-580
ordinal: 364270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run JSG-14..17 plus the zinc:gfx and zinc:game bunnymarks on Pi 4 or 5 and on the Pi 3 (WebGL 1 subset only: three r186 needs WebGL 2) with zinc export --target linux. Complements ZN-534 (VC4 baseline), ZN-540 (three r162 as the WebGL 1 tier) and ZN-561 (Pi 5 validation with three r186). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a table of fps, p95 and memory per demo and board appended to the report
- [ ] #2 each demo's README states its supported boards
- [ ] #3 failures filed as tasks
<!-- AC:END -->
