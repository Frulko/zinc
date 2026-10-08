---
id: ZN-142
title: 'zinc lsp: diagnostics, hover, completion, go to definition'
status: Done
assignee: []
created_date: '2026-10-06 23:02'
updated_date: '2026-10-08 01:17'
labels:
  - tools
  - size-L
milestone: m-10
dependencies:
  - ZN-094
ordinal: 40840
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A language server over the real parser and checker (JSON-RPC over stdio): publishDiagnostics with the Z codes, hover with types, completion of members and imports, definition, document symbols; the editor widget of the atelier uses it. Tree-sitter-typescript (decision) provides syntax highlighting where a full check is too slow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 LSP conformance script (initialize, didOpen, didChange, completion, definition) passes against tests/lsp; diagnostics equal `zinc check --json`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. src/lsp/lsp.{h,cpp}: zinc lsp over the real loader and checker (JSON-RPC on stdio, full document sync, UTF-16 positions): publishDiagnostics with the Z codes equal to zinc check --json, hover with the checker's types, completion (members after a dot through a placeholder re-parse, names in scope, zinc: module specifiers), definition (across modules, through the checker's symbol table), document symbols with class members. tests/lsp/lsp_test.py + tests/t1/lsp.sh. Not done: tree-sitter highlighting (the decision stays open: the full check is fast enough on the test files; revisit with the Atelier widget), hover on members and rename/references.
<!-- SECTION:NOTES:END -->
