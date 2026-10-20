---
id: ZN-736
title: 'Atelier: a project card for an app with a zinc.json'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-12 16:30'
labels:
  - app
  - ui
  - size-M
milestone: m-10
dependencies: []
ordinal: 496410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): when the sketch opened in Atelier is a real app (its folder has a zinc.json), Atelier should say so and offer a small card with the project's information and the means to manage it. Today the header shows the folder's name only, zinc.json has no tab and nothing tells a one-file sketch from a project with an identity, permissions, targets, assets and plugins.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The header tells a project from a plain sketch (the app's name and version from zinc.json, its icon when it has one) and opens the project card; a plain sketch offers to become a project (a zinc.json written with its name and entry)
- [x] #2 The card shows what zinc.json says, read through the engine's own parser or a command of the CLI: name, app id and version, icon, entry, the targets with their sizes, the permissions with one line on what each allows, the plugins the code imports, the assets folder and its size, what the project requires
- [ ] #3 From the card: edit the name, the version, the window size and the permissions (zinc.json rewritten without losing its other keys or its layout more than needed, and checked again), open zinc.json as a tab, show the folder in the Finder, build the app for this machine with its progress in the console
- [x] #4 A scripted session opens a project, reads the card, changes one permission and finds it in zinc.json; one golden of the card, light
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked 2026-10-12 in the worktree of ZN-734, after it, on the Mac. Criteria 1, 2 and 4 are proven; of criterion 3 everything but "show the folder in the Finder" ran: that action opens a window on the desktop, which a test must not do, so it waits for one click by a person (the task is in Review for it).

What exists: app/atelier/app/project.ts (what zinc.json says, the edits), components/Project.tsx (the card and the icon), model.ts (readProject, jsonGet, jsonSet, permissionText, importsOf), the sketch pill of Header.tsx, Sketch > Project… and Sketch > Build App, tools.ts build(). Doc: docs/reports/zinc-next-atelier.md, "The project card".

1. The pill of the header shows the app's name, its version and its icon for a folder with a zinc.json, the folder's name for a plain sketch (unchanged look), and opens the card under it (the start view stays in File > Examples… and in the card's Sketchbook…). A plain sketch's card says what a project adds and has Make it a Project: a zinc.json with the name, `app.id` (com.example.<name>: the engine refuses an `app` without an id), the version 0.1.0 and the entry.
2. The card: name, id, version, icon, entry, the window on this machine (`targets.macos` or `targets.linux`), the other targets with size and display, requires, the plugins the code imports, the assets folder with its file count and size, the permissions with one line each (the table of docs/guide/08-security.md). How it is read: the CLI has no command that prints a parsed project, so zinc.json is read as text in the app (a scanner that finds where each value is; JSON.parse only for a string or a list of strings); the plugins are the imported modules that `zinc plugins` lists; what the engine thinks of the file comes from `zinc check`, whose `zinc.json: line N: …` refusal is now shown on the status line.
3. Edits replace one value of the text, or add one key after the last of its object, on its own line when the object is written on several: every other byte stays. The name is written where it is read (`app.name` when there is one, else `name`), the version in `app.version` (with `app.id` when the project had no `app`), the size in `targets.<this machine>`, the permissions as the list on one line. An edit goes through the tab of zinc.json when it is open (refused while that tab has unsaved changes), then the card is read again and `zinc check` runs. Open zinc.json opens the tab; Build App is `zinc export .` with its steps in the console and `Built dist/<name>-macos` on the status line.
4. tests/t1/atelier_ide.sh, session `project`: the card of a project made by the test says `project weather 1.4.0 id org.example.weather entry src/main.tsx targets macos 900x600, linux 800x480 fbdev permissions menu, fs:read:data plugins … assets assets/, 1 file, 6 bytes requires heap>=8M, display`; `permission:tray` and a name typed in its field are two changed lines of zinc.json, which `zinc check` takes; golden project-12.png (the pill and the card, light). A plain sketch: a press on Make it a Project writes a zinc.json `zinc check` takes. tests/t0/atelier.sh: readProject, jsonSet (a nested value, a missing key in an object on one line and on several, an empty object), permissionText, importsOf.

Evidence: atelier (t0) PASS, atelier_ide PASS twice in a row, atelier_devices PASS. By hand, headless, on copies in a temporary directory: examples/breakout (version typed: `"app": { "id": "com.example.breakout", "version": "2.0.0" }` added; width and height typed: `"targets": { "macos": { "width": 960, "height": 540 } }` added; Build App: the steps of zinc export, `Built dist/breakout-macos`, breakout.app there; the card in the dark theme) and examples/hero (26 files: `plugins zinc:lottie, zinc:video`, four targets, requires; Open zinc.json: the tab; a permission allowed while that tab is open: the only difference with the original is the added key).

Decisions (reversible, no record number taken): zinc.json is read and edited as text in the app rather than through a new CLI command (none exists; the engine stays the judge through zinc check); the card is a popover like the engine menu and the devices panel, no panel that stays; permissions are rows with a removal and a field to allow one, not a list of every key; Build App is zinc export (the app for this machine), not zinc build.

Not proven: Show Folder on a desktop (`open <dir>`, `xdg-open` on Linux; a session without a desktop says where the folder is); the card on Linux (its label says `Window, linux`: the golden is the Mac's); a zinc.json with comments or a byte order mark (the scanner reads plain JSON; such a file shows the plain sketch card); the pointer on the removal cross of a permission (the session uses `permission:<id>`, the same function).

Lines for backlog/later.md:
- ZN-736: edit the app's id, the icon (a file dialog), the entry and the per-target sizes from the card; today they are read there and changed in zinc.json.
- ZN-736: a `zinc project --json` that prints the parsed project (name, app, targets, permissions in force per target, plugins used), so tools stop reading zinc.json themselves.
- ZN-736 (Cross-platform pass): the project card on Linux (the `Window, linux` label, xdg-open), with its own golden or a crop without that label.
- ZN-736: Build App for another target (the export's --target) and for a paired device from the card.
- ZN-736: the Tab key does not go from the width field to the height field of the card (zinc:ui has no focus order between fields here).
<!-- SECTION:NOTES:END -->
