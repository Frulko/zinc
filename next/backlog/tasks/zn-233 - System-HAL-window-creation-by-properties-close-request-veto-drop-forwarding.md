---
id: ZN-233
title: 'System: HAL window creation by properties, close-request veto, drop forwarding'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:40'
labels:
  - system
  - desktop
  - plugins
  - size-S
milestone: m-16
dependencies:
  - ZN-231
ordinal: 52030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-04). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `hal_sdl.cpp` creates the window with properties from `app.window` (frameless, always-on-top, min size, position, transparent flag); defaults produce the same window as today (existing pixel goldens unchanged).
- [x] #2 `hal_close_requested()` weak hook lets a handler cancel the quit; dropped files reach `system.on('drop')`.
- [x] #3 Sim run logs the window creation request fields.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. runtime/include/hal_window.h (new, additive; hal.h untouched): HalWindowConfig + hal_set_window_config/close_handler/drop_handler; targets/macos/hal_sdl.cpp creates the window with SDL_CreateWindowWithProperties (borderless, always on top, transparent, position, min size, resizable, title) only when a config was set, so the default path and the existing goldens are unchanged; SDL_EVENT_QUIT asks the close handler (veto) and SDL_EVENT_DROP_FILE/TEXT call the drop handler. Host: zinc.json app.window parsed in main.cpp (applyAppWindow; width/height used when the target gives none). Plugin: the close handler delivers a 'window' close-requested event and keeps the window open, index.ts confirms with window.confirmClose after the handlers unless one called system.preventClose() (the TS callback is queued, so the veto cannot be synchronous); drops reach system.on('drop') with every path; the simulator logs '[system] window.create <app.window json>' from the baked zinc:system/app module. Goldens window_veto/window_close (interpreter = AOT). A live run with props (alwaysOnTop, titleBar none, position) ran 40 frames without error; not looked at on screen.
<!-- SECTION:NOTES:END -->
