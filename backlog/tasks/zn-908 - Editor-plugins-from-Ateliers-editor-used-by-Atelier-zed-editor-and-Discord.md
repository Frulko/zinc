---
id: ZN-908
title: 'Editor plugins from Atelier''s editor, used by Atelier, zed-editor and Discord'
status: Backlog
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
- [ ] #1 zinc:editor (and the split-out plugins) with docs and a test, on every engine
- [ ] #2 Atelier and examples/zed-editor use the plugins; their own copies are deleted; both still run and pass their tests
- [ ] #3 examples/discord code blocks render through CodeView with highlighting
<!-- AC:END -->
