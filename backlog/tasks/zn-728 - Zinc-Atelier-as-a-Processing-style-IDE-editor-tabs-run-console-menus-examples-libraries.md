---
id: ZN-728
title: >-
  Zinc Atelier as a Processing-style IDE: editor, tabs, run, console, menus,
  examples, libraries
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-12 13:24'
updated_date: '2026-10-12 14:10'
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
Owner request (2026-10-12): an app in the style of the Arduino and Processing IDEs to make Zinc apps: a good, complete code editor for Zinc, tabs, files, Processing's layout, build / run / debug / console with the build and run information live, a desktop menu, libraries and minimal examples at hand; a real experience. It is Zinc Atelier (app/atelier, a 275-line shell today, ZN-143 for its simulators and profiler views). The parts exist: examples/zed-editor is a code editor in Zinc (tabs, project panel, highlighting, find, palette, diagnostics, terminal panel; 2,437 lines; it runs on Zinc Next but calls the prototype's compiler through node), zinc:system has menus, zinc:process runs children, `zinc check`, `zinc lsp`, `zinc dev` (inspector), `zinc plugins` / `zinc add`, templates/ and examples/. Atelier starts from the editor of zed-editor and drives the `zinc` binary it runs on; no node, no prototype, no private path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run app/atelier opens a sketch in one window with Processing's simplicity and no file explorer: the run control (Run, Stop, Debug, engine or target), one tab per file of the sketch with new / rename / close, the editor of zed-editor (highlighting, find, undo, save), a status line and a console under it; the look is Atelier's own (owner, 2026-10-12: a fresh interface, not Processing's theme), light and dark
- [x] #2 Run builds and runs the sketch with the zinc binary Atelier runs on: the stages of the build and the program's output arrive live in the console, the message bar says building / running / exited with its code, Stop ends the program, a click on an error line opens the file at that line
- [x] #3 A desktop menu through zinc:system with its shortcuts: File (New, Open, Examples, Save, Close), Edit, Sketch (Run, Stop, Debug, Add file, Add library), Tools, Help
- [x] #4 Examples: minimal sketches, one idea each, opened as a copy from the menu; Libraries: the plugins the CLI lists, added to the sketch from the menu with their import line
- [x] #5 Diagnostics of zinc check shown in the editor and in the message bar after a save
- [x] #6 Debug runs the sketch under zinc dev and gives its inspector
- [x] #7 A T1 test: a scripted session opens an example, runs it and finds its output in the console; one golden of the window
- [x] #8 The editor edits as a code editor does (owner, 2026-10-12): Tab indents every line of the selection and Shift+Tab unindents (the current line without a selection), Tab without a selection inserts the indent unit; several cursors (Alt+click, Cmd+D next occurrence, Cmd+Alt+Up/Down, Escape back to one) with typing, deleting, pasting, Tab and Shift+Tab applied to all and one undo for the whole edit; the logic is plain functions checked by app/atelier/selftest.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, worktree agent (three commits on its branch: stage A editor/run/console, stage B examples/libraries/menu, stage C debug/test).

What it is now. app/atelier (zinc.json 1280x800, entry main.tsx; about 3,000 lines of Zinc): the editor of examples/zed-editor copied in (syntax.ts, document.ts, motion.ts, search.ts as they were; workspace, theme, tools, palette rewritten), no file explorer: a sketch is a folder and its code files are the tabs. Header: the run control (one pill: Run, then "Building · <step>", then "Running 00:12" with the stop inside; Debug beside it), tabs with + / double click to rename / close, the sketch (opens the start view), the engine (Native, Interpreter, QuickJS, ESP32 emulator), palette, theme. Console card: one status line until the program prints or fails, then it opens; diagnostics are cards that open the file at the line. Themes Paper and Ink, one accent.
Frames: docs/reports/atelier/main-light.png, main-dark.png, start-light.png, problem-dark.png; the test's golden tests/golden/atelier/ide-30.png.

Editing (criterion 8). app/edit.ts: plain functions (text, selections) -> (text, selections): indent / outdent, typeText with pairs, erase, newline, toggleComment, deleteLines / duplicateLines / moveLines, selectNext, addCursorV, move, paste, History. app/cursors.ts joins them to <TextArea>: the field keeps one caret and draws, the buffer keeps the selections and the undo history; typed text is read back in onInput and repeated at the other cursors; the other carets are drawn on a canvas over the field. selftest.ts: 60 checks, `zinc run app/atelier/selftest.ts` -> "selftest passed". In the window (scripted keys): Cmd+Alt+Down twice then typing "X(" gave "X()" on three lines; Shift+Down x3, Tab indented four lines and Cmd+Z restored text and selection; Alt+click and Alt+drag added cursors (checked with ui.pointerAt and the ALT modifier in a throwaway hook: ZINC_INPUT has no modifier on pointer events).
Of the owner's list, all four groups are in. Left out: Alt / Cmd+Backspace with several cursors delete one character; up / down with several cursors have no memory of a wider column; no column (box) selection.

Decisions taken (for the coordinator's decision record):
- A sketch is a folder; `zinc run <main file>` with the folder as working directory; main file = zinc.json "entry", else main.tsx / main.ts, else the first source. New sketches and copies of examples go to ~/Documents/Zinc (ZINC_ATELIER_HOME for tests); the last sketch is remembered in ~/.zinc/atelier.last. Modified files are saved when the sketch runs, when a tab closes and when another sketch opens (no "discard?" dialog).
- One command table (app/commands.ts) feeds the desktop menu (zinc:system/menu), the palette and the keyboard. On a real macOS menu bar the shortcuts are left to the menu (each would run twice: SDL passes Cmd keys to the app and to NSApp); Cut / Copy / Paste / Undo of the menu are replayed as keys to the focused field unless the key itself came (cursors.ts menuKey).
- Libraries: the table `zinc plugins <sketch>` prints, in the palette; choosing one writes its import line (one undoable edit). `zinc add` is not called: the plugins the CLI lists ship with zinc, and the index has no trusted root on this machine (`zinc add audio .` -> "no trusted root for the plugin index").
- Debug: `zinc dev <main file>` (restart at each save, compile errors on the program's screen) and, when zinc dev prints its DevTools line, the Zinc Inspector (app/inspector) is started on that port as a second child; the status line keeps an "Inspector · port N" pill; chrome://inspect works on the same port.
- Scripted sessions: ZINC_ATELIER_SCRIPT (`<frame> <command id | example:<folder> | quit>`), because the ticks of ZINC_SYSTEM_SCRIPT advance during sys.poll and a session that waits for its child (ZINC_ATELIER_SYNC) cannot aim at a frame with them. The test still opens the example with a `menu-click` of the simulator.
- The child always gets ZINC_STEPS=1 for run and dev (the test runner exports ZINC_STEPS=0), and never the ZINC_SHOT / ZINC_INPUT / ZINC_SYSTEM_* variables of a captured Atelier.

Cut from zed-editor: the project panel and project.ts, the file finder, the title bar and status bar (replaced), the minimap, breadcrumbs, soft wrap, font zoom, preview tabs, ANSI colours of the terminal, demo.ts scenes, the node / compiler/bin/zinc.mjs calls.
Cut from the old shell: the Profile and Frames views (model.ts keeps hottest / tracePhases / projectFiles and tests/t0/atelier.sh), the Check button (the check runs at open and after each save); tests/t1/atelier.sh and its four pixel goldens went with the shell; tests/t2/atelier_esp32.sh is rewritten for the new session script and was not run.

Worked around, in the app:
- zinc:ui gives a field's caret and selected text, not its anchor, has no hook on typed text and no caret geometry: cursors.ts guesses the anchor from the text, reads typed text back from onInput, and Editor.tsx places the extra carets with font('mono', 14).
- font('mono', n) is -1 in a program without a font-mono class: the Text example uses sans only.
- the recording simulator says supports('menubar'): main.tsx reads ZINC_HEADLESS / ZINC_DETERMINISTIC to know the menu bar is real.

Lines for backlog/later.md:
- ZN-728: port app/edit.ts and app/cursors.ts back to examples/zed-editor (Tab on a selection, several cursors, comments, pairs): the example still replaces a selection by two spaces on Tab
- ZN-728: zinc:ui anchorOf(h), caretBox(h, offset) and a typed-text hook for <TextArea>, so an editor neither guesses the anchor nor places carets with font metrics (wrapping and fallback glyphs break that)
- ZN-728: font('mono', px) returns -1 in a gfx-only program: bake the mono family for literal font('mono', n) calls, sketches want it
- ZN-728: the simulator's supports('menubar') is true, so menu.native cannot tell a real menu bar from the recorder
- ZN-728: on a real macOS menu bar, check that each shortcut of Atelier runs once and that Edit > Copy with the mouse copies (menuKey); nothing headless can show it
- ZN-728: Atelier on Linux and Windows has no menu bar (the kit's MenuBar from the same template); the palette lists every command meanwhile
- ZN-728: Profile and Frames views of the old Atelier (ZN-143) are out of the window: bring them back in the console card or through the inspector
- ZN-728: tests/t2/atelier_esp32.sh rewritten, to run in the cross-platform pass
- ZN-728: Add Library from the signed index (`zinc add`) once an index root exists; today only the bundled plugins
- ZN-728: stop a running sketch when Atelier quits (no exit hook used; a windowed child may outlive it)
- ZN-728: ANSI colours in Atelier's console, soft wrap and a font size setting (cut from zed-editor)
- ZN-728: the ticks of ZINC_SYSTEM_SCRIPT advance inside sys.poll, so they are not frames in an app that polls: say so in docs/plugins/system.md or count frames

Native path: `zinc run --native app/atelier` (headless) compiles Atelier in 9 s and draws the same frame as the interpreter; its child sketch then builds natively too and the console shows every step (C++ generated, native, link 0/1, link 1/1, done, run native) before the program's line.

Not verified: a real window (everything was seen on headless frames and scripted input: no person clicked, the macOS menu bar and its shortcuts were not seen); Stop on a native child (`zinc run` execs the program, so the signal reaches it: read in main.cpp, shown on an interpreted child only); the ESP32 emulator choice; the packaged app (tools/package still starts app/atelier/main.tsx, which reads zinc.json: run headless as a file entry, not from a package).

Status Review, not Done: the eight criteria pass on headless output; what is left needs a person at the Mac (the window on a real screen, the macOS menu bar and its shortcuts, the owner's eye on the look).
<!-- SECTION:NOTES:END -->
