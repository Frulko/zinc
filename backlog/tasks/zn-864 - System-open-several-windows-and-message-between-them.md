---
id: ZN-864
title: 'System: open several windows and message between them'
status: Backlog
assignee: []
created_date: '2026-10-30 10:10'
labels:
  - system
  - desktop
  - ui
  - size-L
milestone: m-16
dependencies:
  - ZN-249
ordinal: 567460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-30): a program opens more windows at run time and the windows talk to each other, as Electron's BrowserWindow + ipcMain/ipcRenderer or Tauri's WebviewWindow + events. Each window has its own scene (zinc:ui tree or zinc:gfx/zinc:stage frame loop) and its own size, title, position, frame options (zinc:system/window API extended: open, close, list, focus, the current window); a window can run in the main program or in its own thread (reuse zinc:worker, D179-D191: typed messages, no JSON) and windows exchange typed messages through a channel API (BroadcastChannel-like plus request/reply). Closing the last window ends the program unless zinc.json says otherwise. Read docs/reports/system-integration.md, ZN-249 (its multi-window half) and the render-thread/compositor plan (D186/D187) first: per-window scenes depend on the renderer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A program opens a second window with its own zinc:ui tree and closes it; zinc:system/window lists both and moves/resizes each
- [ ] #2 Two windows exchange typed messages both ways (post and request/reply), on interpreter, AOT and QuickJS
- [ ] #3 A window can run its scene in a worker thread so a busy window does not stall the other
- [ ] #4 The inspector lists each window as its own target
- [ ] #5 A T1 test drives two windows headless (frames of each, messages) in under a minute
<!-- AC:END -->
