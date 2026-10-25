---
id: ZN-822
title: 'Dev bar on a device''s screen: quit, the time and a menu over any app'
status: Backlog
assignee: []
created_date: '2026-10-25 07:51'
labels:
  - agent
  - ui
  - size-M
milestone: m-13
dependencies: []
ordinal: 531460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-25: in dev mode (an app started by zinc dev --device, or with ZINC_DEV_BAR=1) a thin bar always on screen lets you quit the app back to the player, shows the time, and opens a menu of actions (restart, performance panel, screenshot, live). There is no compositor on the Pi (fbdev/KMS): the runtime draws the bar itself as an overlay after the program's frame, like the performance panel (runtime/gfx.cpp hud), and takes the pointer and touches on it before the program sees them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an app started by zinc dev --device shows the bar; a deployed app does not unless ZINC_DEV_BAR=1
- [ ] #2 the bar's X ends the app and the player comes back
- [ ] #3 the bar shows the time and opens a menu: restart, performance panel, screenshot
- [ ] #4 a touch on the bar never reaches the program; the program's frame is not changed elsewhere (golden)
<!-- AC:END -->
