---
id: ZN-1032
title: >-
  Multi-window and worker follow-ups (ZN-864): async handler, window-all-closed,
  x/y, stale surfaces
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-08 22:39'
labels:
  - workers
  - windows
  - size-M
milestone: m-16
dependencies: []
ordinal: 5000
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
- [x] #1 `port.handle(async (m) => reply)` replies after the Promise settles
- [x] #2 `open({x, y})` places the window; closing a mounted window removes its Surface
- [x] #3 `app.onAllWindowsClosed` (or the option) ends the program as Electron does
- [x] #4 a scene window skips `drawScene` when the scene did not change
- [x] #5 tests for worker-to-main request and worker timers
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).
Research (sonnet search): Electron ipcMain.handle awaits a returned Promise; a throw/rejection rejects invoke with only the message (https://electronjs.org/docs/latest/api/ipc-renderer); BrowserWindow x/y are screen coordinates, both or neither (https://www.electronjs.org/docs/latest/api/structures/base-window-options); with no window-all-closed listener Electron quits when the last window closes, mainWindow.on('closed', () => app.quit()) is the idiom for 'main closes the app' (https://www.electronjs.org/docs/latest/api/app); repaint skipping: Flutter's markNeedsPaint dirty flag / a generation counter (https://api.flutter.dev/flutter/rendering/RenderObject/markNeedsPaint.html); real-clock timer tests assert a lower bound only.
#1 MessagePort.handle takes (m) => Out | Promise<Out>; a Promise replies when it settles. Engine gap fixed on the way: 'v instanceof Promise' (any generic class) was refused by the checker; it now narrows a union to the one instance of that generic class it holds (check.cpp instanceof + factsOf use the node's type), all three engines. A rejecting handler leaves the request unanswered (unhandled rejection), as a throwing sync one did.
#2 WindowOptions x?/y? (both or neither, Electron); zinc:gfx onWindowClosed(cb(id)) fires at the next frame after a window closes (modules.cpp and qjs.cpp frame steps; id 0 when the main window hides while others are open); zinc:ui drops the closed window's Surface (ui.mountedWindows() lists them); zinc:system/window drops the closed AppWindow from its map. Window ids are monotonic, so a stale handle is refused (windowOpen false, windowCtl 0).
#3 Decision: no app-level window-all-closed hook. Zinc already ends the program when the last window closes (Electron's default with no listener); what was missing was ending it with the main window. AppWindow.onClosed(cb) (Electron's 'closed' event) + zinc:gfx quit gives Electron's idiom: win.get(0).onClosed(quit). sprite-studio uses it (closing the canvas ends the app). A listener that keeps a windowless program running (tray app) needs the HAL's last-window rule to change: later.md line.
#4 A window opened without a draw callback draws its scene once per setScene (sceneGen) or resize, and keep()s the frame otherwise: one drawScene over 60 frames in tests/data/multiwin_close (counted with a temporary log); tests/data/multiwin_worker's side window still matches its golden.
#5 tests/t0/worker_request.sh (worker requests the main program, async handle, worker setTimeout on the real clock; interp, AOT, QuickJS) and tests/t0/multiwin_close.sh (x/y, Surface removal on close and reopen, onClosed, main close + quit with other windows open, scene golden; three engines). Both pass, about 2 s each; checker and affected_paths pass.
Not done (description line, not a criterion): a whole zinc:ui tree in a worker window (D75: one gfx runtime per process).
later.md lines: ZN-1032: reject a port request when the other side's handler throws or rejects (Electron rejects invoke with the message; needs an error envelope with nullable data on the D173 wire). ZN-1032: an app-level window-all-closed listener that keeps a program without windows running (tray apps), as Electron's; needs the HAL's last-window rule (hal_sdl.cpp close_window, nullClose) to ask the program first. ZN-1032: await of a T | Promise<T> value is refused by the checker (Z0109), TypeScript accepts it. ZN-1032: ui.mountWindow takes no x/y; sprite-studio's tools still setPosition after opening.
Proposed tests: tests/t1/multiwin.sh (the existing multi-window session on three engines, now with keep() on scene windows; 12 s, ~300 MB); tests/t1/sprite_studio.sh (the demo with open({x,y}) and onClosed(quit); ~10 s, ~300 MB); by hand: ZINC_BACKGROUND=1 build/zinc run examples/sprite-studio, close the canvas window: tools and preview close with it (1 min, ~200 MB).
<!-- SECTION:NOTES:END -->
