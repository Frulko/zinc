---
id: ZN-981
title: >-
  Hamlet: adventures: send workers on an expedition and get rewards after a
  timer
status: Done
assignee: []
created_date: '2026-11-01 13:13'
updated_date: '2026-11-01 15:12'
labels:
  - hamlet
  - demo
  - m3
  - progression
  - size-M
milestone: m-30
dependencies:
  - ZN-979
  - ZN-980
ordinal: 740080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Settlers Online-style, simplified: an adventure def (duration, cost, risk, rewards) in data; workers leave and return, some may be lost. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 adventures.json with 3 adventures; start/return are commands
- [x] #2 Workers absent from jobs while away; risk uses the sim PRNG
- [x] #3 Test: deterministic result for a seed; save mid-adventure round trips
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: three adventures (forage, hunt, prospect) as data in economy.json "adventures" (not a separate adventures.json: economy.json is the one file the scene already loads and the UI agent owns that scene); rules/adventure.ts (available, canStart, adventureLines, expeditionLines, the adventure_start and adventure_return commands, risk rolled with the sim PRNG per member); members leave world.people (idle residents first, then workers, whose jobs are released) and the daily slice brings them back; at most two expeditions; save H14 stores them and a restore keeps the members away. UI: a panel lists adventureLines() and calls issue('adventure_start', k). Test: rules.ts adventure block (cost, absence from jobs, reward, determinism, total loss, mid-adventure save).
<!-- SECTION:NOTES:END -->
