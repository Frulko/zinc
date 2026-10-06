---
id: ZN-104
title: Display driver selection in the host library
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
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
- [ ] #1 display-ws2812, display-ssd1306 and display-scrollphat open their emulator windows for examples/boards/* and led/*
- [ ] #2 display-remote pair test: frame hashes equal on both ends
<!-- AC:END -->
