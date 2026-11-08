---
id: ZN-972
title: >-
  Hamlet: multiplayer and war: wire protocol, server tables and battle map spec
  (document only)
status: Backlog
assignee: []
created_date: '2026-11-01 13:10'
labels:
  - hamlet
  - demo
  - m2
  - multiplayer
  - docs
  - size-S
  - parked
milestone: m-30
dependencies:
  - ZN-971
ordinal: 101900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn docs/reports/hamlet-multiplayer-design-2026-11-01.md into the protocol: message list, SQLite tables, auth tokens, trade mailbox and escrow, battle room. No code. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/reports/hamlet-multiplayer-protocol.md with messages, tables and sequence for join, command, snapshot repair, trade offer, attack
- [ ] #2 Lists what the client sim must expose (seam checklist) and ticks each item against the tasks
- [ ] #3 A reviewer can implement a server skeleton from it without reading the code
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: parked. (corrected: drop proposed; the Hamlet roadmap is the owner's (commit 489242bf9, New-task: owner): far from the goal, not useless (the 2026-10-25 rule for owner asks).)
<!-- SECTION:NOTES:END -->
