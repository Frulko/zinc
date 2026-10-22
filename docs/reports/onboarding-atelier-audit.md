# Zinc Atelier: first-run audit

Date 2026-10-22. Read-only audit of `app/atelier` (v0.2.0) and its install path. Captured headless with the existing `build/zinc`.
Screenshots (scratch, not committed):
- first launch: `/private/tmp/claude-501/onboarding-atelier/start.png`
- "Hello" example after Run: `/private/tmp/claude-501/onboarding-atelier/hello.png`
- a sketch with two deliberate errors after Run: `/private/tmp/claude-501/onboarding-atelier/bad.png`

## 1. The first minutes

1. Launch with an empty sketchbook: the start view, titled "Start a sketch". One line under it: "An example opens as a copy in <path>: change anything." Then 9 cards: Empty sketch and 8 examples (Hello, Shapes, Animation, Pointer, Keys, Text, Interface, Sound), each with a thumbnail and one line (`examples/index.txt`, `thumbs/`). The cards are good: visual, one click, the example is copied, never edited.
2. Above the cards: a purple Run button, a bug icon (Debug, no label), a "+" , then at the right "No sketch", "Native", a command-palette icon, a moon icon. Nothing explains "Native", the bug, the key icon or the "No sketch" pill.
3. Click Hello: the editor opens with 12 lines of code, a console under it. Run prints the build steps (`engine`, `compile`, `run`), then "Hello from Zinc" and `exit 0`. The window the sketch draws in is a separate window (not seen headless); the Hello example comment explains what it does ("prints a line in the console, then draws a word every frame").
4. Errors (bad.png): red dots in the gutter, red squiggles, a "2 problems" pill, a clickable `main.ts:2:17` link, the message with its code (`Z0103`) and a hint "`zinc explain Z0103` shows an example". This is solid. Two weaknesses: the message says `'string' to 'f64'` although the user wrote `number` (the engine's type name leaks); and `zinc explain` is a terminal command, and a newcomer using Atelier has no terminal and no way to run it. For the typo `rrectt` there is no "did you mean `rrect`".
5. A returning user reopens the last sketch directly (`lastSketch()`), so the start view is seen once.

What a newcomer does not learn anywhere in the app:
- What Zinc is (a typed TypeScript subset), what the language looks like, what it can make (UI apps, games, boards, services). The start view shows only 2D drawing demos; nothing hints at UI apps (the main aim in AGENTS.md), 3D, sound libraries, ESP32 boards, or the big demos in `examples/`.
- What a "sketch" is (a folder with `main.ts` in `~/Documents/Zinc`; the word is borrowed from Processing/Arduino and never defined). The first sentence only gives a path.
- What `zinc:gfx` is, why `onFrame` exists, what `0x9388ff` is, that the sketch opens its own window.
- That they are writing TypeScript (the file is `main.ts`, but no line says it, and no pointer to what is different from plain TS: `i32`, strict types, no `any`).

## 2. Help

- Help menu: Keyboard Shortcuts (it opens the command palette), About (one status line: "Zinc Atelier, running on <path of zinc>"), Check for Updates, Install the Update. That is all. No Documentation, no Guide, no Reference, no tour, no link to the web site or the forum. `grep` finds no URL or `docs/` link in the UI code, apart from a code comment.
- In-app documentation: none. `docs/guide/01..12`, `docs/ui.md`, `lib/zinc.d.ts` exist but only for someone who has the repo.
- Code help exists and is good: a real LSP (`app/lsp.ts`, `zinc lsp`) gives completion (Ctrl+Space, also automatic), signature help, hover and go to definition. This is the closest thing to a reference, but it only helps someone who already typed a name; a newcomer cannot browse "what can zinc:gfx do". Ctrl+Space on a Mac is often taken by the input-source switcher (worth checking).
- Command palette (⌘⇧P) lists the 45 commands; the only discovery path for most features. The palette icon in the header is an unlabelled "⌘".
- Console: see section 1; build steps are shown in grey, program output in black, errors in red with jump links. Good. The `Build failed` status plus the console opening by itself is right.
- The engine pill reads "Native / Interpreter / QuickJS / ESP32 emulator" with no explanation. For a maker the choices mean "fast on this machine / slow but for debugging / JS engine / board". Needs one line each.
- "Check the Sketch", "Build App", "Project...", "Run on a Device...", "Add Library..." are good verbs but are hidden in menus and the palette.

## 3. From sketch to real project

- A sketch is a plain folder; the header pill ("hello") opens a card; for a plain sketch the card offers "Make it a Project" (writes `zinc.json` with name, id, version, entry). Good bridge, but it is hidden behind an unlabelled pill and says "project" without saying what changes (icon, permissions, window size, Build App, devices).
- Build App = `zinc export .` (console shows the steps, the status line names the output folder in `dist/`). No "reveal in Finder" after a build, no explanation of what was made (a .app? a folder?).
- Devices panel: pair by name/address and a code. Good for those who own a device; there is no explanation of what a device is or what `zinc agent` is, no list of supported boards, and the ESP32 emulator is the only no-hardware path (it is listed in the engine menu, unexplained).
- Templates (`templates/`: game, game-2d, desktop-app, 3d, cli, iot, iot-board, eink, plugin, remarkable, server, service, dashboard) are reachable only through `zinc new` in a terminal. Atelier has no "New project from template" and the start view lists none of them. This is the largest gap between "a sketch" and what the product promises (UI apps, boards, services).
- Sharing/export: no "Share", "Export as zip", "Publish" or "Copy the sketch". Only Build App and `Open Folder` (Project card).
- Libraries: "Add Library..." lists plugins and writes the import line. Good, but not explained (what a plugin offers).

## 4. Install and discovery

- `tools/install.sh --atelier`: installs the CLI archive plus `Zinc-Atelier-<version>-macos-<arch>.zip` into /Applications or ~/Applications; on Linux a `.desktop` entry. Windows zip is documented. The packaged app carries its own engine (docs/guide/01), so a newcomer does not need `zinc` on PATH. Good.
- Two weak spots: `docs/guide/01-getting-started.md` is the only place that mentions Atelier and it starts with a `curl | sh` command: the "no terminal" user still needs a terminal to get the app with `--atelier`, unless they download the zip by hand. No download page for Atelier was found in the README (grep of `README.md` finds nothing).
- `app/atelier/package-macos.sh` (dev build) writes `ZINC_BIN` and the shell PATH into the bundle: it only runs on the machine that built it. Fine for developers, not for users.
- Without `zinc` found: `ZINC` falls back to the bare name `zinc`; a failed start shows the status "Cannot start zinc" and one red console line `zinc: <error>`. No hint (where to get Zinc, what to install, how to point Atelier to a binary). Reaching this case needs the dev build; with the packaged app it should not happen, but a corrupted install or a moved app would show it.
- Inconsistent first folder: Atelier's own sketchbook is `~/Documents/Zinc` (`workspace.ts: sketchbook()`), while the launcher in `tools/package` opens `~/Zinc` and creates `hello.ts` there (the Linux launcher, comment says so). Worth checking which folder the packaged macOS and Windows apps use; one folder name avoids a "where did my sketch go" question.
- Updating the app means downloading a new zip; "Install the Update" explains this by a status line only.

## 5. User-visible strings (for i18n)

Everything is an English literal in the code; nothing is centralised. There is no locale, language, `i18n`, `t(` or translation table anywhere in `app/atelier` (grep of `locale|lang|i18n` is empty); the only hit-free "language" notion is the OS menu role names. Rough inventory:

| Where | Count (approx.) | How built |
|---|---|---|
| `app/commands.ts` | 45 command names (menus, palette) + 7 messages | `add(menu, id, 'Name', keys, fn)`: one table, easiest to extract; menu titles `'File','Edit','Sketch','Tools','Help'` are an array in `main.tsx`; engine names via `'Run on: ' + ENGINES[i]` (concatenation) |
| `app/tools.ts` | ~43 status/console messages | `setStatus('Build failed', 2)`, template literals with values (`Exited with code ${code}`, `Built ${...}`, `Lost ${remote}: ...`), `'Update: ' + last`; also parses zinc's English output (`stepOf`, `classify`), which is not translatable by Atelier |
| `app/workspace.ts` | ~15 + the `STARTER` sketch comment | `say('Cannot create a sketch in ' + ...)`, template literals |
| `app/project.ts`, `model.ts` | ~14 + 66 quoted strings (permission descriptions via `permissionText`, target names) | literals and a lookup |
| `app/lsp.ts` | 3 | concatenation |
| `components/*.tsx` | ~25 JSX text nodes and 7 placeholders (Start 3, Devices 7, Project 6, Header 2, Console 2, Editor 2, Palette 1) | JSX text, template literals with counts and plural logic: `` `${n} problem${n > 1 ? 's' : ''}` ``, `${n} cursors`, `${n} selected`, `Ln ${l}, Col ${c}`, `Window, ${HERE}` |
| `examples/index.txt` | 8 titles + 8 one-liners | `folder|Title|text`, in a data file (already separable) |
| `examples/*/main.ts` | header comment in each (8 files) | English code comments: content to translate, not UI |
| macOS menu | role items (App menu, Window) | native, follow the OS language |
| Whole total | roughly 250 to 300 strings | |

Notes for the i18n work: (a) plurals are built by hand (`'s'` suffix) in at least the problem counter; (b) strings are joined from pieces in `tools.ts` and `commands.ts` (`'Name of the new file'`, `'New name of ' + b.name`, `Type "delete" to remove ${b.name}...`), so a `t('key', {name})` with placeholders is needed, not a word-by-word lookup; (c) compiler diagnostics (`Z0103 ...`) and the `zinc explain` texts come from the engine (`src/`, `docs/diagnostics.md`), so they need a separate catalog keyed by error code; (d) the console parses engine output text, so a localised engine must keep machine fields stable; (e) the engine's own `zinc` messages and the docs are English only; the LSP hover texts come from `lib/zinc.d.ts` comments.
Cheapest path: one `strings.ts` (key to English text, a `t()` using template placeholders), a language setting read from `ZINC_ATELIER_HOME/settings` and the OS locale (`sys.env('LANG')`), and a pass over the 45-row command table first.

## 6. Comparison and what fits

| Tool | Onboarding idea | Fit for Atelier |
|---|---|---|
| Arduino IDE 2 | File > Examples grouped by topic and level (01.Basics, ...), Help > Getting Started and Reference open the docs; the board/port picker is the first thing | Group examples by level; Help > Reference |
| Processing | Examples by category; Reference opens with a word selected (right-click > Find in Reference); a short "Tutorials" page | Reference on a selected word; hover help already exists, add "Open docs" |
| p5.js web editor | Starts with a working sketch and a live preview beside the code; a Reference site; "Examples" page with categories; language switch in settings (many languages) | Preview already is the sketch window; language switch fits |
| Thonny | Minimal UI, a variable view, plain errors in beginner words ("Assistant" explains errors) | Error helper: explain `Z0103` in the console without a terminal |
| Scratch | First run is a short tutorial gallery ("Tutorials" cards: make a thing in 5 steps); sprite/palette discovery | Guided first lesson, 3 to 5 steps in cards |
| Godot project manager | Templates list + "Asset library" + language chooser on the first start, a "New project" dialog with renderer choice explained in one line | Project templates dialog; one-line explanations of engines |
| MakeCode | Home screen with tutorial and project galleries, simulator beside the editor, device pairing guide, a language menu in a cog | Gallery by goal, simulator already in the engine menu |
| Unity Hub | Learn tab, Templates by kind (2D, 3D, mobile), installs engine versions | Templates by kind, "Learn" entry |

Ideas ranked for Atelier: welcome card on the start view, examples by level and by goal, a Help menu that opens docs, a reference panel/search beside the editor (offline copy of docs and `zinc.d.ts`), a guided first lesson built from existing examples, a "what can I make" gallery fed by `examples/` and `templates/`, a language switch in settings.

## 7. Friction points ranked by impact on a first-time user

1. **No in-app help or link to docs.** Help menu has no documentation entry; the user cannot learn the language or the API without leaving the app. Fix: add Help > Documentation, Guide, Reference, Report a problem (open the web pages with the system opener); ship `docs/guide` and a generated API list inside the app so it also works offline.
2. **The start view does not say what Zinc is or what can be made.** Fix: a three-line welcome above the cards ("Zinc is a typed TypeScript for apps, games and boards. A sketch is one folder: write, press Run, a window opens.") and a second row "Make a real app" with the templates.
3. **No path from a sketch to the products promised (UI app, game, board, service).** Templates only through `zinc new`. Fix: File > New Project from Template... listing `templates/*/template.json` (name, description, targets), creating the project in the sketchbook; add a UI-app example (`interface` exists) at the top.
4. **Only 2D drawing examples, flat list, no level.** Fix: group "First steps / Interaction / Interface / Sound / Boards", order by difficulty, add 3D, a game, a board example; keep `index.txt` format with a third field.
5. **Errors need the terminal.** `zinc explain Z0103` is not runnable from Atelier; engine type names (`f64`) leak; no "did you mean". Fix: make the code `Z0103` in the console a link that shows the explanation in a panel (call `zinc explain` and print it); map `f64` to `number` in messages; add a nearest-name hint for `Cannot find name`.
6. **Unlabelled header controls and unexplained engine names.** Bug, "⌘", sketch pill, "Native". Fix: tooltips (hover help) on every header control; one line per engine in the menu; rename the bug "Debug".
7. **The first run and the sketch concept are never explained.** The generated starter comment is one line. Fix: a richer starter with 4 comment lines (what `onFrame` is, units, how to stop) and a one-time "How it works" tour of 4 steps (editor, Run, console, examples) with a "Skip".
8. **Install needs `curl | sh`, and no download page was found.** Fix: link a plain "Download for macOS / Windows / Linux" in README and the site; keep `--atelier` for terminal users.
9. **No "zinc not found" help, inconsistent sketch folder (`~/Documents/Zinc` vs `~/Zinc`).** Fix: on `Cannot start zinc` print where it looked and what to do; pick one folder name and show it on the start view as a "Show in Finder" link.
10. **No sharing/export of a sketch.** Fix: File > Export Sketch as Zip; reveal the built app after Build App.
11. **No language choice, all strings are literals.** See section 5.
12. **Debug and Ctrl+Space discoverability.** The shortcut Ctrl+Space may clash with the macOS input switch; fix: also bind ⌥Space or show completion automatically while typing (it may already do so; verify in a real window).

## 8. Quick wins (each under a day, no new engine feature)

- Welcome paragraph on the start view (2 lines + the definition of "sketch").
- Help menu: Documentation, Language guide, Report a problem, Zinc web site, all opening a URL.
- Tooltips on the header controls and one line per engine.
- Starter sketch and the 8 examples: a 3-line "try this" comment (change a number, press ⌘R).
- Examples grouped with a heading per level in `index.txt` and `Start.tsx`.
- Make `Z0101` and similar codes clickable to a panel that runs `zinc explain <code>`; replace `f64` by `number` in that message.
- Hint on "Cannot start zinc" (where it looked, how to reinstall).
- Extract strings into one `strings.ts` table starting with `commands.ts` (45 names) and `Start.tsx`, with a `t()` helper, before any more UI is added.
- Show the sketchbook folder as a link ("Show in Finder") and align the `~/Zinc` and `~/Documents/Zinc` names.
- Add "Templates" cards to the start view that run `zinc new` into the sketchbook.

## 8b. First-launch mode and guided tour (design, owner request)

Goal: a newcomer who opens Atelier for the first time is guided through one real run, one real error and its fix in under three minutes, can skip at any step, and can replay it. Nothing here needs an engine change.

### When it triggers
- First launch: no `tour.done` marker (below) and no last sketch. Today this is the case where `setStartOpen(true)` runs in `main.tsx`; the tour starts right after, on top of the start view. A user who opens Atelier with a folder argument (`zinc run app/atelier -- <dir>`) or with a last sketch never gets it unasked.
- On demand: Help > Tour (new command `tour` in `app/commands.ts`, so it also appears in the palette and the scripted sessions) and a "Take the tour" link on the start view.
- Never while `ZINC_ATELIER_HOME` is set for the existing tests unless the test asks (`ZINC_ATELIER_TOUR=1`), so current goldens do not change.

### Steps (each points at a part of the window)
0. Language: a card in the middle of the window, a list of languages (English first, the OS language preselected) and "Continue". See the language section below.
1. Welcome (start view, whole window): "Zinc is a typed TypeScript for apps, games and boards. You write a sketch, a folder with `main.ts`, and press Run." Points at: the card grid. Offers Next or "Skip tour".
2. Pick an example (spotlight on the Hello card): "Click Hello: it opens as a copy, change anything." The step waits for the click (the command `example:hello` already exists), then moves on by itself.
3. The editor (spotlight on `EditorCard`): "This is the code. Colours show names, strings and numbers. Try changing 'Hello' to your name."
4. Run (spotlight on the Run pill in `Header.tsx`): "Press Run (or the key shown). The sketch opens in its own window." Waits for the phase to leave IDLE (`phase()` in `tools.ts`), then continues; if headless, the console line "exit 0" is enough.
5. The console (spotlight on `ConsoleCard`): "What the program prints and the steps of the build appear here."
6. A deliberate error and its fix: the tour inserts a typo in the open sketch (`clear` becomes `clearr`), runs the check, and points at the red dot, the squiggle and the "1 problem" pill: "A mistake. Click the red link in the console to jump to it." The next step offers "Fix it for me" (restores the word) or lets the user fix it; it waits until `problems()` is empty. This teaches the error flow, the jump link and (with the fix from section 7, item 5) the explanation panel.
7. Help and completion (spotlight on the Help menu entry and the editor): "Type `draw` and press Ctrl+Space to see what exists. Help > Documentation has the guide and the reference." Needs the Help items of section 7, item 1.
8. The palette (spotlight on the command icon in the header): "Everything Atelier can do is here: press the key shown, type a word."
9. Engines and devices (spotlight on the engine pill, then the Devices entry): "Native runs here. The ESP32 emulator needs no board. Paired boards appear in this list."
10. Next steps: a card with the templates ("Make a real app": the section 3 template list) and "Finish". Finishing writes the marker.

### How it highlights
A single `Tour` overlay component, added last in `App()` of `main.tsx` beside `Palette`, with the same `absolute inset-0` pattern used by `EngineMenu` (hidden through `style={{ hidden }}`):
- Dim layer: four translucent rectangles around the target box, or one `Canvas` that fills the window and cuts a rounded hole (the app already draws with `Canvas onDraw`, `rrect` and `border`).
- Target box: `ui.screenBox(node)` (already used in `Header.tsx` `revealActiveTab`), so each target needs a node ref (`createNodeRef`, already used in Console, Palette, Devices). Targets: Run pill, tabs bar, `EditorCard`, `ConsoleCard`, command icon, engine pill, start view card for Hello.
- Step card: a small `View` placed next to the box (below it, or above if there is no room), with a title, two lines of text, a progress "3 / 10", and Back, Next and "Skip tour". Escape skips (the `ui.onKey` handler in `main.tsx` already closes overlays in order; the tour goes first).
- Waiting steps (2, 4, 6) show "Do it to continue" and advance when a signal changes; Next stays available so nobody is stuck.
- The overlay lets pointer events through the hole so the real control still works, and blocks the rest.
- Steps are data: an array of `{ id, target, titleKey, textKey, waitFor }` in a new `app/tour.ts`, with the texts going through the string table of section 5 (so the tour is translated with the rest).

### How it remembers
A small settings file next to the existing last-sketch file (`lastFile()` in `workspace.ts`: `~/.zinc/atelier.last`, or `<ZINC_ATELIER_HOME>/.last` under test): `~/.zinc/atelier.json` (`<ZINC_ATELIER_HOME>/.atelier.json` under test) with `{ "tour": "done", "tourVersion": 1, "language": "fr" }`. Reasons: it reuses the folder the app already writes to (tests set `ZINC_ATELIER_HOME`, so a fresh scratch dir means a fresh first launch; the user's sketches stay clean), it is readable and deletable by the user, and no new storage API is needed (`fs.readText` / `fs.writeText`). The marker records the tour version so a major new tour can be offered once as "What is new". Skip also writes `done` (with `skipped: true`) so it never nags; Help > Tour always replays.

### Language choice at first launch
Step 0 is shown before the tour (also when the tour is skipped later). Default: the OS language (`LANG`/`LC_ALL` through `sys.env`, first two letters) if a catalogue exists, else English. The choice is saved in `.atelier.json` and can be changed in a new Tools > Language submenu (items built from the catalogue list, like the Open Example submenu in `installMenu`). Only English exists until `strings.ts` is built, so the step is hidden when one language exists; build the catalogue mechanism first (section 5), then ship the step with the first translation. The language names are shown in their own language.

### Files touched
- New: `app/atelier/app/tour.ts` (steps, state signals, `startTour()`, `nextStep()`, `skipTour()`, marker read/write), `app/atelier/components/Tour.tsx` (overlay, card), later `app/atelier/app/strings.ts`.
- Edited: `main.tsx` (mount `<Tour />`, start it after `setStartOpen(true)`, Escape handling, new script verbs), `app/commands.ts` (command `tour`, Help items), `components/Header.tsx`, `Console.tsx`, `Editor.tsx`, `Start.tsx` (node refs on the targets, the "Take the tour" link), `app/workspace.ts` (settings file helper next to `lastFile`), `app/tools.ts` (nothing, only reads `phase()`).
- Docs: one line in `CHANGELOG.md` "Unreleased" when it ships; `tests/` mapping in `tests/affected.json`.

### Scripted test (`ZINC_ATELIER_SCRIPT`, headless)
New verbs next to `example:` and `wait:` in `stepScript()`: `tour:next`, `tour:skip`, `tour:step` (print the current step id), `tour:lang:<code>`. A T1 test `tests/t1/atelier_tour.sh` with a fresh `ZINC_ATELIER_HOME` and `ZINC_ATELIER_TOUR=1` checks:
1. a fresh home starts at step 0/1 and prints the step id and its target box (non-empty, inside the window);
2. `tour:next` through every step prints ids in order, and each target box is non-empty (catches a refactor that removes a node ref);
3. the waiting steps advance by themselves after `example:hello`, `run` and the fixed typo (`wait:exit 0`, `wait:problem` checks);
4. the error step: the console says `Z0101`, then the fix leaves 0 problems;
5. `tour:skip` or finishing writes `.atelier.json` with `tour: done`; a second launch on the same home starts no tour; `command tour` (Help > Tour) starts it again;
6. language: `tour:lang:xx` writes the language and the next step shows the translated card title (needs a second catalogue; until then check that an unknown code falls back to English);
7. one `ZINC_SHOT` per two steps (cards 1, 6, 10) against goldens: one golden per feature, not per step, as AGENTS.md asks.
The test stays on the interpreter and a few frames, so it is short.

### Comparison
| Tool | What it does | Take for Atelier |
|---|---|---|
| VS Code walkthroughs | A "Get Started" page with a checklist of steps; each step has text, an image and a command button, completion events (a command ran, a file opened), progress remembered, replay from Help > Welcome | The step data with `waitFor` events, the checklist progress, Help > Tour; but VS Code does not spotlight the UI, which a coachmark does better |
| Godot | A first-start dialog (language, then the project manager with templates and a "Learn" hint); an in-editor tutorial is not built in, the docs are one click away (Help > Online Docs, Tutorials, Search Help with an offline class reference) | Language at the very first start; an offline searchable reference (Search Help is a strong idea) |
| Arduino IDE 2 | No tour; File > Examples and "Getting Started" link; the board and port picker is the first friction, with a message when none is chosen | Examples by topic; clear message when the target is missing |
| MakeCode tutorials | Step-by-step lessons with a highlight over the toolbox blocks and the code, "Hint" button, a checked result before the next step, galleries by level | The model closest to the tour: highlight, hint, wait for a check, then next; later turn the tour into several short lessons reusing the same overlay |

Cost estimate: about 400 lines in `Tour.tsx` and `tour.ts` and a day or two with the test; the string table (section 5) is the real prerequisite for the language step.

## Not checked

- Real window behaviour (the sketch's own window, tooltips, Ctrl+Space, the native menu bar) since only headless runs were used.
- The macOS and Windows launcher folder (only the Linux launcher text in `tools/package` was read).
- The web site for a download page for Atelier.
