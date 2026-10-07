---
id: ZN-104
title: Display driver selection in the host library
status: Done
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-07 09:54'
labels:
  - plugins
  - simulator
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-078
ordinal: 40460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc.json `display` and `--display` select a display plugin; link or load the driver (HalDisplay of runtime/gfx.cpp already routes frames), honour host_window and owns_input in hal_dispatch.cpp, driver options to ZP_* defines. Drivers: fbdev, gl, remote, rmpp, scrollphat, ssd1306, st7789, ws2812.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 display-ws2812, display-ssd1306 and display-scrollphat open their emulator windows for examples/boards/* and led/*
- [x] #2 display-remote pair test: frame hashes equal on both ends
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Display drivers are plugins of kind display built into the plugin cache from their sources and ZP_DISPLAY_* options and dlopened (the static constructor registers the HalDisplay); zinc build links them whole and bakes the board surface. selectDisplay resolves ZINC_DISPLAY / targets.<t>.display / display / board file. gfx finish now shuts the driver down. ws2812, ssd1306 and scrollphat emulator windows open for examples/boards/* and led/* (SDL dummy driver in the test, frames saved with ZINC_SHOT); display-remote with the zinc:remote viewer on loopback ends on the same pixels as the server's own render (the thunk generator learned Promise<T> for this). Not done: gl, fbdev, rmpp, st7789 drivers are only selected the same way (their devices/GPU paths are other tasks); hal_dispatch owns_input is untouched (display-gl is ZN-116).
<!-- SECTION:NOTES:END -->
