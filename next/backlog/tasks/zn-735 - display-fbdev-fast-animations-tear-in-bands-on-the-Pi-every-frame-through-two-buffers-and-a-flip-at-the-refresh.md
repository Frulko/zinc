---
id: ZN-735
title: >-
  display-fbdev: fast animations tear in bands on the Pi: every frame through
  two buffers and a flip at the refresh
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 16:17'
labels:
  - rpi
  - render
  - perf
  - size-M
milestone: m-25
dependencies: []
ordinal: 64200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-12, at the Pi 3B+ (DSI screen): fast animations show a glitch, the picture cut in bands, and do not look fluid. Cause read in plugins/display-fbdev/fbdev.cpp: without a video picture a frame is converted straight into /dev/fb0, the buffer on the screen, 16 rows a band on four threads, and the wait that should time that write to the vertical blank does not wait on this screen (FBIO_WAITFORVSYNC returns at once: the kernel's framebuffer emulation waits for its first CRTC and the DSI screen is on another, ZN-731), so the scan-out reads a buffer half written: bands of the new frame beside bands of the old. The driver already has the cure for frames with a video picture: two buffers of the display and an atomic commit that shows the finished one at the refresh (planes_present). Use it for every frame when the display has it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a display with KMS no frame is written to the buffer on the screen: every frame goes to the buffer that is not shown and one commit shows it at the refresh, with or without a video picture; ZINC_FBDEV_FLIP=0 gives the old path back; a display without KMS and ZINC_FBDEV_SIM are unchanged
- [ ] #2 A partial update stays partial: the buffer written gets this frame's damage and what the frame before changed, not the whole surface
- [ ] #3 Measured on the Pi 3B+ with examples/hero's navigation, before and after, at the board's full clock: frames a second, present p50 and p99, CPU; logged in the task notes for docs/reports/zinc-next-perf.md; no loss above 15% or the reason and the trade written
- [ ] #4 The existing tests of the driver pass (the file framebuffer); hero is left running on the Pi for the owner to look: the task goes to Review, not Done, until he says the bands are gone
<!-- AC:END -->
