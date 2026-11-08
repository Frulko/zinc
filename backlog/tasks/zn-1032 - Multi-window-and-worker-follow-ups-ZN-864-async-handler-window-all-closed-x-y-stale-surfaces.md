---
id: ZN-1032
title: >-
  Multi-window and worker follow-ups (ZN-864): async handler, window-all-closed,
  x/y, stale surfaces
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
labels:
  - workers
  - windows
  - size-M
milestone: m-16
dependencies: []
ordinal: 5000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`MessagePort.handle` takes no async handler; no test sends a request from a worker to the main program or uses worker timers on the real clock; `zinc:system/window open()` takes no x/y; a closed `mountWindow` window leaves its Surface in the list (sprite-studio reopening leaks one more); there is no way to end the program when the main window closes (window-all-closed); a scene window repaints every frame when unchanged. Close these gaps.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-864: let `MessagePort.handle` take an async handler (a Promise reply), as Electron's `ipcMain.handle` does.
- ZN-864: test a request sent from a worker to the main program (the port supports it, no test covers it).
- ZN-864: run a whole zinc:ui tree in a worker window; today only a `Scene` display list crosses (gfx runtime per process, D75).
- ZN-864: `zinc:system/window` `open()` takes no x/y in its options; the program calls `setPosition` after opening.
- ZN-864: a closed `mountWindow` window leaves its zinc:ui Surface in the surfaces list; drop it.
- ZN-864: no way to end the program when the main window closes (Electron's window-all-closed); closing sprite-studio's canvas leaves the tools and preview open.
- ZN-864: sprite-studio reopens its tools window with `mountWindow` on the same root, one more stale Surface per reopen (see the closed-Surface line above).
- ZN-864: test worker timers (`setTimeout` in a worker on the real clock); sprite-studio's preview relies on them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `port.handle(async (m) => reply)` replies after the Promise settles
- [ ] #2 `open({x, y})` places the window; closing a mounted window removes its Surface
- [ ] #3 `app.onAllWindowsClosed` (or the option) ends the program as Electron does
- [ ] #4 a scene window skips `drawScene` when the scene did not change
- [ ] #5 tests for worker-to-main request and worker timers
<!-- AC:END -->
