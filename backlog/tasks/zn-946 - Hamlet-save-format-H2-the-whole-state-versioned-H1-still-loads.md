---
id: ZN-946
title: 'Hamlet: save format H2: the whole state, versioned, H1 still loads'
status: Backlog
assignee: []
created_date: '2026-11-01 13:00'
labels:
  - hamlet
  - demo
  - m1
  - save
  - multiplayer-seam
  - size-M
milestone: m-30
dependencies:
  - ZN-943
ordinal: 700070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The save keeps people, deer, stocks, tick and PRNG, in one text line per town, and the snapshot/restore code is separate from zinc:storage so a server can reuse it. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 snapshot()/restore() work on a string and a World with no storage import; save.ts only wraps them
- [ ] #2 H2 round trip: stateHash before == after for a village with stocks, workers mid-job, deer, 600 ticks played
- [ ] #3 H1 saves still load (test fixture from the current format)
- [ ] #4 Unknown future versions are refused with a message, not a crash
<!-- AC:END -->
