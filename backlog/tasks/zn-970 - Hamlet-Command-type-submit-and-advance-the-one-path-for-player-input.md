---
id: ZN-970
title: 'Hamlet: Command type, submit and advance: the one path for player input'
status: Backlog
assignee: []
created_date: '2026-11-01 13:09'
labels:
  - hamlet
  - demo
  - m2
  - multiplayer-seam
  - size-M
milestone: m-30
dependencies:
  - ZN-939
  - ZN-941
ordinal: 730000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every player action becomes data (Command {tick, player, type, args}); the scene calls submit(cmd) and the sim consumes the queue at the tick. Single-player uses the same path a server will use. No network code. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Commands for place, demolish, road drag, pause defined as data; HamletScene no longer calls applyTool directly
- [ ] #2 advance(n) steps n ticks consuming commands in order; two runs with the same command list give the same stateHash on the 3 engines
- [ ] #3 Command validation lives in rules/ and rejects with a reason (shown by the HUD)
- [ ] #4 The scripted session of hamlet.sh runs through submit
<!-- AC:END -->
