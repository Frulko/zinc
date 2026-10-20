---
id: ZN-732
title: >-
  Atelier: completion, signature help and hover from zinc lsp, and a finer
  editor
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-12 14:13'
updated_date: '2026-10-12 14:53'
labels:
  - app
  - ui
  - lsp
  - size-L
milestone: m-10
dependencies: []
ordinal: 493410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12), after ZN-728: improve the editing part of Atelier and add the language server for completion and suggestions while typing, with the syntax (signature), the description and the arguments. `zinc lsp` (next/src/lsp/lsp.cpp, 388 lines, ZN-142) answers completion (label, kind, a type as detail), hover (a type), definition, documentSymbol and diagnostics; it has no signatureHelp and no documentation from doc comments. Atelier (next/app/atelier) has no client: its diagnostics come from `zinc check` after a save. zinc:process writes to a child's stdin, so the client is a `zinc lsp` child spoken to in JSON-RPC.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc lsp: completion items carry the signature as detail and the declaration's doc comment as documentation (the program's own code and the standard library's declarations); textDocument/signatureHelp answers inside a call with the parameters, the active one and the doc; hover shows the doc; tests/t0/lsp.sh covers the three
- [x] #2 Atelier speaks to a zinc lsp child (open, change, close per tab): a completion popup opens while typing an identifier and after a dot, filters as one types, shows kind, signature and description of the selected item, Enter or Tab accepts, Escape closes
- [x] #3 Inside a call Atelier shows the signature with the active argument marked and its description; resting the pointer on a name shows its type and doc; Cmd+click or F12 goes to the definition, across the sketch's tabs
- [x] #4 Diagnostics arrive from the server while typing, without a save
- [x] #5 Editor: word and line deletion with several cursors, the column kept when moving up and down, the matching bracket and the other occurrences of the selection highlighted, the caret always scrolled into view; what else was fixed is listed in the notes
- [x] #6 The self test covers the protocol framing and the filtering; a scripted session types a member access, sees the popup, accepts an item and finds it in the text; one golden of the popup
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, worktree agent (three commits: the client in Atelier, the server, the editor with the session test).

The server (next/src/lsp/lsp.cpp, 388 -> 748 lines). Completion items: `detail` is the signature read in the source from the name to the body (`step(dt: number, w: number): void`), `class Name`, else the type; `documentation` is the comment above the declaration (a /** */ block or the // lines; `@param name text` lines become the parameters' docs). The built-in modules (zinc:gfx, zinc:sys...) are compiled from sources without comments: their docs are read in lib/gfx.d.ts and lib/modules.d.ts. Names are no longer cut to the typed prefix (the editor filters, so `sw` finds strokeWidth); they are limited to the file's own names, its imports, the globals and the locals of the functions around the position. Member completion also works while a name is typed after the dot, in a .tsx file after JSX (positions go through the file's JSX map), and after `ns.` of `import * as ns` (the module's exports). New: textDocument/signatureHelp (trigger `(` and `,`): the callee found in the text (name, `new Name`, `object.name`, `ns.name`), its parameters as [start, end] in the label, the active one from the commas before the position, also while the call is still open (`b.step(1, `). Hover shows the signature of a function or method and the doc under it; definition also answers on a member (`b.step`). The server keeps the last analysis that reached the type checker, so answers survive the syntax error being typed.
Test: tests/t1/lsp.sh (tests/lsp/lsp_test.py, section 8 on tests/lsp/docs.ts): 18 new checks, `lsp_test: ok`.

The client (next/app/atelier). app/rpc.ts: plain functions (framing by UTF-8 bytes over UTF-16 strings, a Reader for chunks, file URIs escaped as the server escapes them, the answers read into Item / Sig / Problem, the fuzzy filter). app/lsp.ts: one `zinc lsp` child per sketch through zinc:process; didOpen / didChange (whole text, 150 ms after the last keystroke, or at once when a request needs it) / didClose per code tab; one wanted request per kind, late answers dropped; restarted once if it dies (checked by killing the child twice: 2 starts, no third); it ends with the sketch and with Atelier. components/Assist.tsx: the popup under the name (kind mark, label with the matched characters in the accent, the signature and the description of the selected row under the list), the signature card above the caret's line with the active parameter in the accent, the hover card (350 ms of rest). Keys: arrows, Enter or Tab accept at every cursor, Escape closes; Enter on a name typed in full is a line break; Ctrl+Space asks (Edit > Suggest); F12 and Cmd+click go to the definition (Edit > Go to Definition), opening the tab; a declaration outside the sketch (the standard library) is named on the status line, not opened.
Diagnostics: the server's arrive while typing and go to the editor and the status line. `zinc check` after a save is kept: the server publishes the changed document only, so an error that a change in util.ts causes in main.ts shows after the save. A check's result no longer overwrites a file edited since.
Frames: docs/reports/atelier/assist-popup.png (the golden), assist-signature-dark.png, assist-hover.png (a .tsx sketch).

The editor (criterion 5). app/edit.ts: eraseTo (Alt+Backspace / Alt+Delete: the spaces, then one word or one run of punctuation, never past the line; Cmd+Backspace / Cmd+Delete: to the start / end of the line) at every cursor; move() with the memory of the column; complete(); occurrences(). Matching brackets were already boxed. The other occurrences of a selected whole word are filled near the visible lines. Fixed on the way, each seen in a scripted session:
- up and down used a stale column after any edit made by the app (Backspace, Tab, Enter): the field keeps a goalX that ui.select() does not reset. Up and down are now the buffer's with one cursor too.
- Alt+Backspace with several cursors deleted across lines up to the previous word (first version here): now stops at the line.
- member completion and hover did nothing in a .tsx file after the first JSX (offsets of the lowered text).
- the server's name list held engine names with freed text (__host_*), harmless while the prefix filter hid them: filtered.
- keywords missing from the list (break, continue, case, default, finally...) made Enter after `break` accept a fuzzy match.
- the popup lists the program's names before the keywords.
- the caret is in view after a far jump (definition at line 152 of a long file) and after the edits there: checked on a frame, nothing to fix.
Self test: 99 checks (60 before), `selftest passed`. Session: tests/t1/atelier_ide.sh section "assist" (the popup golden tests/golden/atelier/assist-15.png, the diagnostic before any save, `b.step()` in the saved text, the signature with its first parameter, the server gone with Atelier).

Asked by the owner during the task:
- Quit: `role:quit` of the app menu and the window's close request stop the running sketch, the inspector and the language server first (main.tsx leave()). Checked in a real window without clicking: Atelier started in the background with a sketch running, SIGTERM to its pid: `[status] Leaving`, Atelier and its two children gone within a second.
- Files in folders: sketchFiles() walks the sketch's folders (not the hidden ones, node_modules, build, dist); a tab is named by its path in the sketch without `src/` (game/game.ts); a sketch with 8 or more other code files opens its main file only; the + of the tab strip and Cmd+P (File > Open File...) open a palette of the sketch's files, "New File..." first; go to definition opens such a file. Checked on a sketch of 12 files in src/ (one tab at open, definition opened game/game.ts).

Lines for next/backlog/later.md:
- ZN-732: zinc:ui select() and setValue() should reset the field's goalX (up / down column); Atelier moves up and down itself meanwhile
- ZN-732: zinc:ui caretBox(h, offset) and offsetAt(h, x, y) for a text field: Atelier places its popup, cards and hover with font('mono', 14) metrics
- ZN-732: F12 has no key name outside the macOS menu bar (HAL keys stop at PageDown): Go to Definition is in the menu and the palette only on Linux and Windows
- ZN-732: ModuleInfo keeps no `import * as ns` alias: the server finds the module of `ns.` by its path; a list of aliases would end the guess
- ZN-732: zinc lsp publishes the diagnostics of the changed document only: re-publish the open documents that import it, then Atelier can drop `zinc check` after a save
- ZN-732: completion inside the braces of an import (`import { | } from`), of JSX element and attribute names, and of string / array members with their signatures (a fixed list of names today)
- ZN-732: accepting a function could add its parentheses; a box (column) selection; PageUp / PageDown with the buffer's column memory
- ZN-732: several signatures for overloads; signature help inside an object literal argument (`f({ a: | })` answers nothing)
- ZN-732: the hover and signature cards are clipped by the editor card near its right edge when the text is long (width is capped to the pane, the text is cut)

Not verified: a person typing in a real window (speed of the popup under real typing, Cmd+click with a real pointer: ZINC_INPUT has no modifier on pointer events, so F12 and the command were used), the macOS menu bar's Ctrl+Space and F12, hover while the pointer moves fast.
<!-- SECTION:NOTES:END -->
