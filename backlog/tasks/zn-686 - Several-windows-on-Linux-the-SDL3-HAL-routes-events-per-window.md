---
id: ZN-686
title: 'Several windows on Linux: the SDL3 HAL routes events per window'
status: Backlog
assignee: []
created_date: '2026-10-10 19:41'
labels:
  - desktop
  - linux
  - deferred
  - size-S
milestone: m-27
dependencies:
  - ZN-663
ordinal: 446410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-663 (targets/macos/hal_sdl.cpp, shared by macOS and Linux) opens windows beside the main one with an SDL_Renderer each, routes events by SDL_GetWindowFromEvent, hides a closed main window while others are open. Verified on macOS only (cross-platform pass: Linux comes last). Run tests/t1/windows.sh and a live two-window run of tests/data/ui_windows in the Linux container or on a Linux desktop (X11 and Wayland), and check focus, text input in the second window and closing order.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/t1/windows.sh passes on Linux
- [ ] #2 a live run shows both windows, clicks and typing reach the right one, closing the last one ends the program
<!-- AC:END -->
