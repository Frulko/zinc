---
id: ZN-884
title: 'Zinc shell P1: top bar and one app composed in software on the Pi'
status: In Progress
assignee: []
created_date: '2026-10-30 20:29'
updated_date: '2026-10-30 22:02'
labels:
  - size-L
  - pi
  - ui
milestone: m-25
dependencies: []
ordinal: 578460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The player becomes the shell (D194, docs/reports/zinc-shell/03-design.md phase P1): display-shell driver for apps, zinc:shell plugin (socket, spawn, shm buffers, input forwarding, Home), runtime input hook, dyn_update_rect, HalDisplay.suspend, the player in shell mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 display-shell: an app connects to ZINC_SHELL_SOCKET, draws into the buffers it is given, sends FRAME with damage and follows RELEASE
- [x] #2 zinc:shell: start(dir,name) spawns with the agent's pid and log files, composes the app's image below the bar, forwards input shifted by the bar, home() sends QUIT then ends the group
- [x] #3 the player in shell mode shows the bar on every page and the app below it; Home returns to the hub
- [ ] #4 tests/t1/shell_compose.sh: sim framebuffer, an app under the bar, a tap reaches it shifted, Home ends it within 3 s, kill -9 shows the crash page, a program that never connects gets the screen
- [x] #5 on the Spark: an app under the bar, Home works
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30: display-shell (3a05a1d9e), runtime hooks + zinc:shell (69f50ebe5, f02f5b554), linked-plugin fix (c14ed8865), player shell mode (5437525ea), nested-shell fix (a7261f58b). Proven: tests/t0/display_shell.sh, tests/t0/shell_plugin.sh; on the Mac the player in shell mode showed a packed app at 800x448 below a 32 px bar, a tap at (400,300) reached it at (400,268), Home returned to the hub; on the Spark (develop engine 235f17d8f) the owner ran Marble under the bar and Home. Left (owner: test later): tests/t1/shell_compose.sh (AC 4). Run on the Spark: zinc device zinc-player run zinc-player --env ZINC_SHELL_SOCKET=/run/zinc/shell.sock.
<!-- SECTION:NOTES:END -->
