---
id: ZN-1067
title: 'zinc:shell: touch routing, lazy listen, ABI check'
status: Backlog
assignee: []
created_date: '2026-11-07 16:43'
labels:
  - shell
  - size-M
milestone: m-16
dependencies: []
ordinal: 6200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Defects of the Pi shell found while building ZN-884 and ZN-888 that can be fixed and tested on the Mac sim.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-884: display-shell renders into a staging copy, then copies the damage into the buffer; rendering straight into the free buffer (render_box, stride w*4) saves a copy per frame. Measure on a Pi 3 first.
- ZN-884: zinc:shell routes touches by position each frame; route each touch id by where it started, as the pointer is.
- ZN-884: a dyn_update_rect change should also reach the device path's diff_rects_sig (ZRT_COMPACT_PREV), which damages the whole image today.
- ZN-884: zinc:shell listens as soon as the module loads, also under `zinc check` (a stderr line); listen on first use instead.
- ZN-884: a display driver built against the old hal.h has a shorter HalDisplay; reading ->suspend reads past it. Check the driver's ABI version before using suspend.
- ZN-888: the shell answers the GL file lease itself (suspend its display) instead of the session stopping and restarting it, which costs a cold start of the shell after each GL app.
- ZN-888: the boot app under the shell is named `app`; use agent/apps/<name> when ZINC_APP points there, so `zinc device stop <name>` matches it.
- ZN-888: shell.start should accept a .zapp file or a project directory, as the old zinc-session loop did, so a ZINC_APP that is not an app folder still starts.
- ZN-888: a T1 test with the real player in shell mode (ZINC_FBDEV_SIM) and zinc device run/stop through the agent, instead of stand-in sockets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each touch id is routed by where it started; the shell listens on first use, not at module load
- [ ] #2 A display driver ABI version is checked before reading suspend; dyn_update_rect reaches diff_rects_sig
- [ ] #3 The shell answers the GL file lease itself; shell.start accepts a .zapp or a directory; boot app named from ZINC_APP
- [ ] #4 A T1 test with the real player in shell mode under ZINC_FBDEV_SIM and zinc device run/stop
<!-- AC:END -->
