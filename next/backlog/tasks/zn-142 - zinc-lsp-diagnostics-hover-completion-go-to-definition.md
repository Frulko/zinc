---
id: ZN-142
title: 'zinc lsp: diagnostics, hover, completion, go to definition'
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
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
- [ ] #1 LSP conformance script (initialize, didOpen, didChange, completion, definition) passes against tests/lsp; diagnostics equal `zinc check --json`
<!-- AC:END -->
