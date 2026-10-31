---
id: ZN-908
title: 'Editor plugins from Atelier''s editor, used by Atelier, zed-editor and Discord'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:11'
labels:
  - ui
  - plugins
  - size-L
milestone: m-28
dependencies: []
ordinal: 602460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: Atelier's code editor (app/atelier/app: document, edit, text, cursors, syntax, theme, fuzzy, lsp, rpc; components/Editor.tsx and Palette.tsx) is the most complete; examples/zed-editor carries an older copy. Extract it into reusable plugins following the plugin conventions (plugins/*/plugin.json, docs/plugins): zinc:editor (document model, multi-cursor editing, undo, syntax highlighting, the Editor component, a read-only highlighted CodeView for snippets), and separate plugins where a piece stands alone (e.g. zinc:editor-lsp for the LSP client, the command palette with fuzzy search). Atelier and examples/zed-editor then import them (zed-editor gets the newer editor, nothing lost), and examples/discord's code blocks use CodeView. Improve what the extraction exposes (themes from the editor theme tokens, language registry).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:editor (and the split-out plugins) with docs and a test, on every engine
- [x] #2 Atelier and examples/zed-editor use the plugins; their own copies are deleted; both still run and pass their tests
- [x] #3 examples/discord code blocks render through CodeView with highlighting
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-10-31). Commits: feat(frontend) statements before super(); fix(gfx) font() TTF fallback; feat(editor) the plugins + Atelier; feat(zed-editor); fix(web); feat(discord) CodeView + this file.

Plugins: zinc:editor (plugins/editor: syntax with registerLanguage/langOf/langNamed, Doc, edit.ts commands, EditorState, cursors.ts keys and multi-cursor, CodeEditor, Minimap, CodeView, caretInfo, drawCursors, themes LIGHT/DARK (Atelier's, after macOS) and ONE_LIGHT/ONE_DARK, useThemes/toggleTheme); zinc:command-palette (fuzzy, ranked, PaletteItem, <Palette>; not "palette": lib/std/palette.ts is the colour palette); zinc:editor-lsp (rpc, LspConfig + useLsp, Popup/Signature/Hover cards, desktop targets). Docs: docs/plugins/editor.md. Test: tests/t1/editor.sh (editor_core on interpreter, QuickJS and AOT against tests/golden/editor/editor_core.out; editor_view headless: typing at two cursors, undo, redo, frame view-12.png).

Engine gaps fixed on the way: Z0118 refused statements before super() (TS 4.6; checker + lowering, fixtures in tests/golden/checker, run on the interpreter and QuickJS in tests/t0/checker.sh, AOT checked by hand); font('mono', n) returned -1 when the face was only named in a plugin (faces of library and plugin files are not baked, ZN-428), so textWidth was 0: font() now falls back to the TrueType face.

Web input model (owner asked: textarea, canvas or contenteditable). Choice: keep Zinc's own rendering and route keyboard, text, IME composition, dead keys and paste through one hidden, focus-holding <textarea> placed at the caret; pointer and wheel go to zinc:ui's own input in its coordinates; no browser focus ring. Why: Monaco and Google Docs/Figma do exactly this (their own drawing, one hidden input); CodeMirror 6's contenteditable needs the browser to lay out and own the text, which would mean a second editor beside zinc:ui's (highlighting, several cursors, gutter, marks all re-done in DOM); a native <textarea> (what `--render dom` gave) shows plain text only: the owner's screenshots (4-row band, yellow ring, no colours) were exactly that. Zinc's canvas render already used one hidden textarea, so the DOM render now does the same for fields it cannot express (domPainted: a multi-line field with line numbers, highlighting, marks or editor colours): targets/web/dom.js paintField draws paintEdit on a canvas in the field's box, ui.ts gains domPainted/domPaintEdit/domOrigin. Other text fields stay native elements.
Also found and fixed on the web: the runtime numbered mouse buttons from 1 (SDL) where zinc:ui and every HAL number from 0, so a left click was read as the middle button and a right click as Back (clicks in canvas mode never placed a caret); the hidden textarea of canvas mode covered the focused field and swallowed its clicks (pointer-events:none now); an absolute inset-0 TextArea got the 4-row default height in DOM mode; zinc:i18n on the web reads the catalogs the build now ships as i18n/<lang>/<area>.json (Atelier showed atelier.header.run). Checked by screenshot in headless Chrome: zed-editor and Atelier under `zinc dev --target web` in both render modes (highlighting, full height, click places the caret, typing, no ring, translated labels), and a `zinc export --target web --render dom` of zed-editor (builds and starts; an export has no file system, so it opens no folder).
After the rebase on develop (Atelier's macOS redesign): the plugin's Atelier themes are now develop's Light and Dark (LIGHT/DARK, with the new `sidebar` token; PAPER/INK are gone), the goldens editor_core.out and view-12.png were made again, `zinc check` passes for app/atelier, examples/zed-editor and examples/discord. Discord: Markdown.tsx's K_CODE block is a CodeView (lang from the fence) on Discord's colours; the showcase has no code block, so the proof is a small zinc:ui/react program with that same block, drawn headless (highlighted). Not re-run after the rebase: the engine could not be rebuilt (the disk was full: 318 MB free), so tests/t1/editor.sh, atelier_ide (its ide-30.png was renewed before the rebase: the TrueType fallback moves the pane by 1 px) and the Atelier tests need one run on the integrated build.
Not done: a web check in the plugin test (it needs Chrome and a dev server, ~20 s; tools/web-dom-test is the place); `zinc export` of Atelier stops on its zinc.json name "Zinc Atelier" (not a file name).
<!-- SECTION:NOTES:END -->
