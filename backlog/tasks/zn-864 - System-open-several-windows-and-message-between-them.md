---
id: ZN-864
title: 'System: open several windows and message between them'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 10:10'
updated_date: '2026-10-30 13:41'
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
- [x] #1 A program opens a second window with its own zinc:ui tree and closes it; zinc:system/window lists both and moves/resizes each
- [x] #2 Two windows exchange typed messages both ways (post and request/reply), on interpreter, AOT and QuickJS
- [x] #3 A window can run its scene in a worker thread so a busy window does not stall the other
- [ ] #4 The inspector lists each window as its own target
- [x] #5 A T1 test drives two windows headless (frames of each, messages) in under a minute
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (#1 #2 #3 #5), 2026-10-30. API choice (Electron/Tauri model, scored informally: reuse D75's zinc:gfx windows over a new per-window runtime): zinc:system/window gains AppWindow (id, close, isOpen, focus, setTitle, setPosition, setSize, setBounds, bounds, setScene), open(options, draw?), get(id) (wraps zinc:gfx openWindow / zinc:ui mountWindow ids, 0 = main), list(), current(); one new graphics row host.gfxWindowCtl (id, op, s, a, b) and one optional HAL call hal_win_ctl (SDL HAL: SDL_SetWindowPosition/Size/Title, RaiseWindow skipped under ZINC_BACKGROUND; headless HAL keeps the asked frame, a resized side window's surface follows; window module loads the symbol optionally). Messages: zinc:worker gains MessagePort<Out, In> (postMessage, onmessage, request -> Promise<In>, handle((In) => Out)), MessageChannel<A, B> (same program, delivered as microtasks), and over a worker Envelope<T> records on the D173 wire: workerPort(new Worker<Envelope<Out>, Envelope<In>>(...)) and parentPort<Out, In>() in the worker. Why there: a worker cannot import zinc:system/window as a value (it imports zinc:gfx), and the web's MessageChannel sits with Worker. A reply has the type the other side posts (one schema per direction on the wire). #3: a worker cannot draw (D181 refuses zinc:gfx in workers; a per-thread runtime is D75's rejected option), so a worker computes a Scene (background + Shape records: rect, rrect, text, line) and the window opened without a draw callback draws the last one: a 1.5 s busy request leaves the main window drawing (>30 frames meanwhile). Proof: tests/t1/multiwin.sh (interp, AOT, QuickJS lines and two frame goldens each; worker scene goldens; real-clock busy run), 12 s. Also passed: windows, worker_wire, worker_basic, worker_engines, headless_close, host, image_pixels, system_ops; a live background run moved and resized both SDL windows. native_gen fails on develop already (zinc_native_cdp.h vs the frozen header, from the inspector work), not this change. Handover #4 (left open on purpose: another agent owns app/inspector and plugins/devtools): the inspector should list each window as a CDP target (Target.getTargets / setAutoAttach, one page target per zinc:system/window list() id, screen and Elements per window: zinc:ui's Surface per window from mountWindow); next command after that work lands: read plugins/devtools target listing and add one target per open window id (windowCtl(0, 8) and windowOpen). Not done: async handle (a handler returning a Promise), worker-to-main requests are supported by the same port but untested, zinc:ui trees in a worker, QuickJS workers (none yet).
<!-- SECTION:NOTES:END -->
