---
id: ZN-820
title: >-
  Player launcher: recent apps with icons, a dev badge, delete, and a full
  launcher past six
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-25 07:50'
labels:
  - player
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 529460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: the player's home on a device (image/player) lists the apps sent to it, newest first, each with its icon and name, a DEV band on an app sent by zinc dev, a way to delete one; past six apps a + button opens a launcher page with all of them. The agent keeps what the player needs (name, icon, when sent, dev or deployed).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the home shows the last six apps sent with their icon, newest first; a tap starts one
- [ ] #2 an app sent by zinc dev --device carries a DEV band; a deployed one does not
- [ ] #3 an app can be deleted from the player (with a confirmation) and is gone from zinc device apps
- [ ] #4 past six apps a + button opens a launcher page with all of them
- [ ] #5 a T1 test of the player (headless) shows the list from an agent's apps directory
<!-- AC:END -->
