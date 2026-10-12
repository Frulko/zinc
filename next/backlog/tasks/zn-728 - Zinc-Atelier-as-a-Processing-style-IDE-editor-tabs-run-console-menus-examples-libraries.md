---
id: ZN-728
title: >-
  Zinc Atelier as a Processing-style IDE: editor, tabs, run, console, menus,
  examples, libraries
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 13:24'
labels:
  - app
  - ui
  - size-L
milestone: m-10
dependencies: []
ordinal: 490410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): an app in the style of the Arduino and Processing IDEs to make Zinc apps: a good, complete code editor for Zinc, tabs, files, Processing's layout, build / run / debug / console with the build and run information live, a desktop menu, libraries and minimal examples at hand; a real experience. It is Zinc Atelier (next/app/atelier, a 275-line shell today, ZN-143 for its simulators and profiler views). The parts exist: examples/zed-editor is a code editor in Zinc (tabs, project panel, highlighting, find, palette, diagnostics, terminal panel; 2,437 lines; it runs on Zinc Next but calls the prototype's compiler through node), zinc:system has menus, zinc:process runs children, `zinc check`, `zinc lsp`, `zinc dev` (inspector), `zinc plugins` / `zinc add`, templates/ and examples/. Atelier starts from the editor of zed-editor and drives the `zinc` binary it runs on; no node, no prototype, no private path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run next/app/atelier opens a sketch in Processing's layout: toolbar (Run, Stop, Debug, engine or target), one tab per file of the sketch with new / rename / close, the editor of zed-editor (highlighting, find, undo, save), a message bar and a console under it; light and dark
- [ ] #2 Run builds and runs the sketch with the zinc binary Atelier runs on: the stages of the build and the program's output arrive live in the console, the message bar says building / running / exited with its code, Stop ends the program, a click on an error line opens the file at that line
- [ ] #3 A desktop menu through zinc:system with its shortcuts: File (New, Open, Examples, Save, Close), Edit, Sketch (Run, Stop, Debug, Add file, Add library), Tools, Help
- [ ] #4 Examples: minimal sketches, one idea each, opened as a copy from the menu; Libraries: the plugins the CLI lists, added to the sketch from the menu with their import line
- [ ] #5 Diagnostics of zinc check shown in the editor and in the message bar after a save
- [ ] #6 Debug runs the sketch under zinc dev and gives its inspector
- [ ] #7 A T1 test: a scripted session opens an example, runs it and finds its output in the console; one golden of the window
<!-- AC:END -->
