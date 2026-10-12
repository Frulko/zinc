---
id: ZN-732
title: >-
  Atelier: completion, signature help and hover from zinc lsp, and a finer
  editor
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-12 14:13'
updated_date: '2026-10-12 14:31'
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
- [ ] #1 zinc lsp: completion items carry the signature as detail and the declaration's doc comment as documentation (the program's own code and the standard library's declarations); textDocument/signatureHelp answers inside a call with the parameters, the active one and the doc; hover shows the doc; tests/t0/lsp.sh covers the three
- [ ] #2 Atelier speaks to a zinc lsp child (open, change, close per tab): a completion popup opens while typing an identifier and after a dot, filters as one types, shows kind, signature and description of the selected item, Enter or Tab accepts, Escape closes
- [ ] #3 Inside a call Atelier shows the signature with the active argument marked and its description; resting the pointer on a name shows its type and doc; Cmd+click or F12 goes to the definition, across the sketch's tabs
- [ ] #4 Diagnostics arrive from the server while typing, without a save
- [ ] #5 Editor: word and line deletion with several cursors, the column kept when moving up and down, the matching bracket and the other occurrences of the selection highlighted, the caret always scrolled into view; what else was fixed is listed in the notes
- [ ] #6 The self test covers the protocol framing and the filtering; a scripted session types a member access, sees the popup, accepts an item and finds it in the text; one golden of the popup
<!-- AC:END -->
