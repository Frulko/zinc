---
id: ZN-971
title: 'Hamlet: command log recorder and replay'
status: Backlog
assignee: []
created_date: '2026-11-01 13:10'
labels:
  - hamlet
  - demo
  - m2
  - multiplayer-seam
  - size-S
milestone: m-30
dependencies:
  - ZN-970
  - ZN-946
ordinal: 11100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Replay a scripted 2000-tick log to equal hash; corrupt line rejected.

Log = seed/preset + list of commands with ticks; replaying from the start reproduces the final state hash. Doubles as a regression format and as the server's authority check. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 recordLog()/replayLog(text) in a module with no storage or window
- [ ] #2 Test: a 2000-tick scripted village replays to the same hash on interpreter, AOT and QuickJS
- [ ] #3 A log with a corrupt command is rejected at the line number
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Log and replayAt exist (commands.ts:26); needs recorder/replay-from-file and the 3-engine hash test.
<!-- SECTION:NOTES:END -->
