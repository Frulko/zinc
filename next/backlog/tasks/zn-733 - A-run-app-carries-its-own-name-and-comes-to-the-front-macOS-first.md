---
id: ZN-733
title: A run app carries its own name and comes to the front (macOS first)
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 14:37'
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
- [ ] #1 On macOS the window title, the app menu's title and the Dock name of a run app are the project's name, on the interpreter and natively; the process list shows that name (the native program is named after the project, the interpreter sets its process name)
- [ ] #2 The window of a run app is in front and has the keyboard when it opens, also when started from a terminal or from Atelier; a headless or deterministic run and a kiosk are unchanged
- [ ] #3 A test checks the name the window is given (the simulator's log or a headless hook) on both engines; what could only be checked by eye is listed in the notes; the Linux and Windows checks are lines for the cross-platform pass
<!-- AC:END -->
