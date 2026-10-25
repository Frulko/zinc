---
id: ZN-822
title: 'Dev bar on a device''s screen: quit, the time and a menu over any app'
status: Done
assignee: []
created_date: '2026-10-25 07:51'
updated_date: '2026-10-25 08:11'
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
- [x] #1 an app started by zinc dev --device shows the bar; a deployed app does not unless ZINC_DEV_BAR=1
- [x] #2 the bar's X ends the app and the player comes back
- [x] #3 the bar shows the time and opens a menu: restart, performance panel, screenshot
- [x] #4 a touch on the bar never reaches the program; the program's frame is not changed elsewhere (golden)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-25: runtime/gfx.cpp devbar (an overlay after the HUD, its own damage, input taken in frame_start before the HUD's); host hooks in src/host/mirror.cpp (wall_minute, dev_restart = exit 75); the agent sets ZINC_DEV_BAR=1 and ZINC_SHOT_DIR=~/.zinc/agent/shots and starts a program that exits 75 again (src/agent/dev.cpp). The player comes back on X through the existing screen release. Proof: tests/t1/dev_bar.sh (bbox of the bar 320x14 and menu 320x62 against the frame without it, presses not seen by the program, X quits, panel, screenshot equals the frame without the bar, exit 75), tests/t1/agent_dev_perf.sh (ZINC_DEV_BAR in the session's env, exit 75 restarted). Not proven on the Pi's touch screen: one look after the next release (touch[0] is taken as the pointer).
<!-- SECTION:NOTES:END -->
