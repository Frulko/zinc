---
id: ZN-758
title: >-
  Music remote: notifications over any view, a notification slide and the
  pairing assistant
status: Backlog
assignee: []
created_date: '2026-10-17 08:46'
labels:
  - mobile
  - ui
  - size-M
milestone: m-26
dependencies:
  - ZN-756
ordinal: 196170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: on the tablet (examples/music), a relayed notification wakes the screen if it is off and slides in over the current view (icon, app, title, body, time; larger in StandBy), several stack; a carousel slide lists the last notifications, well presented, with swipe to delete and clear all; when not paired, the same slide holds a step-by-step pairing assistant showing the code and the tablet's address (and what to do without discovery). Design and protocol: ../docs/reports/notification-relay-design.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the Nexus 7, a notification sent from the Mac relay appears over the player, the clock and the settings, and wakes the screen from off
- [ ] #2 the notification slide lists, deletes and clears; the list survives a restart
- [ ] #3 the pairing assistant pairs a new Mac step by step (screenshots of each step)
<!-- AC:END -->
