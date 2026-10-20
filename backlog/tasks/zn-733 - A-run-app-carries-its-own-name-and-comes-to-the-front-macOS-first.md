---
id: ZN-733
title: A run app carries its own name and comes to the front (macOS first)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-12 14:37'
updated_date: '2026-10-12 14:59'
labels:
  - host
  - macos
  - size-S
milestone: m-10
dependencies: []
ordinal: 494410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12), seen while running sketches from Atelier: an app started by `zinc run` (and by Atelier's Run) shows as "zinc" (window title, Dock, menu bar, process list: `zinc run …` on the interpreter, `~/.zinc/cache/run/<hash>/app` natively) and its window can open behind the others. It must carry the project's name (zinc.json "name", else the folder or file name) and come to the foreground when it opens. The window is created hidden in targets/macos/hal_sdl.cpp (SDL_CreateWindowAndRenderer(cfg->title, …) near line 332, the properties form near 346) and shown later (SDL_ShowWindow near 361 and 846); nothing raises it or activates the app.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On macOS the window title, the app menu's title and the Dock name of a run app are the project's name, on the interpreter and natively; the process list shows that name (the native program is named after the project, the interpreter sets its process name)
- [x] #2 The window of a run app is in front and has the keyboard when it opens, also when started from a terminal or from Atelier; a headless or deterministic run and a kiosk are unchanged
- [x] #3 A test checks the name the window is given (the simulator's log or a headless hook) on both engines; what could only be checked by eye is listed in the notes; the Linux and Windows checks are lines for the cross-platform pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, worktree agent (chained after ZN-732, same build tree).

The name. `zinc run` (src/main.cpp, where it reads zinc.json) names its program: zinc.json "name", else the project's folder, else the folder of a main.* / index.* file, else the file's name; it exports it as ZINC_APP_NAME, over the one of the app that started the run (Atelier's sketches are not "Zinc Atelier"). The host (src/host/gfx_host.cpp startSurface) gives it to the window config in place of "zinc" (a zinc.json window title still wins), and the SDL HAL gives it to SDL's app metadata before SDL_Init.
What each step really changes on macOS, asked to System Events on a real window (tests/data/app_name, name "Blue Demo"):
- the window config's title: the window's title, on both engines ("Blue Demo")
- SDL's app metadata and NSProcessInfo's processName: nothing in the menu bar (it still read "Apple, zinc, Window" on the interpreter). processName was removed again; the metadata stays for the items of the app menu SDL builds.
- the executable's file name: the menu bar's app title, the process list and the name System Events (and so the Dock) gives the process. So the native program is started through a hard link named after the project beside `app` in its run cache (`~/.zinc/cache/run/<hash>/Blue Demo`), and the interpreter, when a window may open (not ZINC_HEADLESS, not ZINC_DETERMINISTIC), starts again once through a symlink `~/.zinc/cache/run/names/<name>` to the engine. After that, on both engines: `ps -o comm=` ends in "Blue Demo", the menu bar reads "Apple, Blue Demo, Window", the frontmost process is "Blue Demo".
The front. The main window is raised (SDL_RaiseWindow: activates the app and makes the window key) when it is first shown, in targets/macos/hal_sdl.cpp show_main(); not in a deterministic run, not in a kiosk, not with ZINC_NO_RAISE=1 (for a check that must not take the keyboard). Read with `osascript` (System Events, allowed on this Mac): started in the background from a shell, the frontmost process was the run app on the native engine and on the interpreter; a sketch started by Atelier's Run was frontmost ("anim"). One reading of five said iTerm2 (the owner was using the desktop at that moment); the next run of the same case said "Blue Demo".
Test: tests/t1/run_app_name.sh (the name the host is given, read on ZINC_WINDOW_LOG: zinc.json name on the interpreter and natively, the folder of a main file, a file alone, the parent's name not kept), PASS; tests/t1/atelier_ide.sh PASS.

Decision for the coordinator's record: a run app takes its name from its executable's file name, through a link (hard link for the native program, a symlink and one more exec for the interpreter), because macOS reads the menu bar title, the Dock name and the process name there and nowhere a program can set.

Not checked, by eye only: the Dock's label and icon (System Events names the process "Blue Demo"; nobody looked at the Dock), that the raised window takes typed keys (no key was sent to the desktop), the fullscreen path of show_main.

Lines for next/backlog/later.md (cross-platform pass):
- ZN-733: Linux: the window title follows ZINC_APP_NAME already; check the taskbar name (SDL app metadata, the WM class) and `ps` (prctl PR_SET_NAME or the same link), and that the window is raised under X11 and Wayland (a compositor may refuse)
- ZN-733: Windows: the taskbar and Task Manager name of a run app (the executable's name, or an AppUserModelID), and SetForegroundWindow's rules when started from a console
- ZN-733: `zinc build` and packaged apps name their window "zinc" unless zinc.json sets window.title: give them the project's name at build time
- ZN-733: old links stay in ~/.zinc/cache/run/names (one symlink per project name): clear them with the run cache
<!-- SECTION:NOTES:END -->
