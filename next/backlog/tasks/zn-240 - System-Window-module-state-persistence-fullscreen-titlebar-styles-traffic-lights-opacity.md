---
id: ZN-240
title: >-
  System: Window module: state persistence, fullscreen, titlebar styles, traffic
  lights, opacity
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:32'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-233
  - ZN-232
ordinal: 52100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-11). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 State file round trip in a temp dir; clamping to displays tested with injected display rectangles (pure function, T0).
- [x] #2 Selftest reads `NSWindow` style mask and traffic-light button origins equal to the configured position after a resize and after fullscreen toggling.
- [x] #3 `onCloseRequested` + `hide` + tray click `show` loop works in sim and live.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system/window.ts: State/Rect, pure clampToDisplays (monitor removed, off-screen, too big, straddling, fullscreen on a gone display) + JSON state file round trip in a temp dir (plugins/system/tests/test-window-state.ts), setters and readers (title, size, position, center, always on top, opacity, min size, fullscreen, maximize, minimize, hide, show, focus, titleBar default/hidden/overlay/none, traffic lights), onCloseRequested/keepOpen, restore/save with dataDir. macOS native on the SDL NSWindow with NSWindow notifications (moved, resized, fullscreen events; traffic lights reapplied on every resize): tests/golden/macos/window opens a real window and reads style mask, title bar flags, opacity, level and the close/zoom button origins: 20,22 and 60,22 stay after two resizes and after entering and leaving fullscreen (tests/t1/macos_window.sh). Sim golden window_tray: close requested -> keepOpen + hide, tray click -> show. Not run live: the close button itself (needs a click).
<!-- SECTION:NOTES:END -->
