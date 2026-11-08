---
id: ZN-1020
title: >-
  zinc lsp: completion in imports and JSX, auto-import, re-publish dependents,
  request order
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:35'
updated_date: '2026-11-08 21:47'
labels:
  - lsp
  - tools
  - size-M
milestone: m-20
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Completion inside the braces of an import, of JSX element and attribute names, string and array members with signatures; auto-import (a name not imported is not proposed); re-publish diagnostics of open documents that import a changed one; track `import * as ns`; answer no request before initialize or after shutdown; a failed .d.ts read must not stick.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-732: zinc lsp publishes the diagnostics of the changed document only: re-publish the open documents that import it, then Atelier can drop `zinc check` after a save; ModuleInfo keeps no `import * as ns` alias, so the server finds the module of `ns.` by its path.
- ZN-732: completion inside the braces of an import, of JSX element and attribute names, and of string and array members with their signatures (a fixed list of names today); several signatures for overloads; signature help inside an object literal argument.
- ZN-732: auto-import in zinc lsp and Atelier: a name that is not imported is not proposed today (`rr` gives no `rrect`; `gfx.rr` after `import * as gfx` does, with signature and doc): list the exports of the zinc:* modules, of the sketch's files and of the added plugins, show where each comes from, and add or extend the import line on accept (`additionalTextEdits`); also the module names inside `from '…'`.
- ZN-998: LSP still answers requests before initialize or after shutdown, and a failed .d.ts read sets dtsRead_ for good.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 completion lists work in the four positions in an lsp T1 test
- [x] #2 typing `rr` proposes `rrect` and adds the import
- [x] #3 editing a module re-publishes its importers
- [x] #4 requests before initialize get the LSP error
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (src/lsp/lsp.cpp).
- Completion: inside import braces (the exports of the spec, read by loading 'export * from spec' beside the document, so relative and lib/std specs resolve exactly as the loader does); in a .tsx file after '<' the host components and the capitalised functions/classes in scope, and after '<Tag ' the host attributes or the fields of a component's props type; string and array members read from lib/zinc.d.ts (interface String / Array<T>) with signature, doc and the overload count; module names inside from '…' include the sketch's other files.
- Auto-import: the exports of the built-in modules (declare module blocks of lib/gfx.d.ts, modules.d.ts, ui.d.ts) and of the sketch's other .ts/.tsx files that start as typed and are not in scope; labelDetails.description names the module, additionalTextEdits adds 'import { x } from ...' after the imports or extends a one-line import of that module; isIncomplete true. Atelier (plugins/editor, editor-lsp) applies the edit on accept (SideEdit, replaceAt) and shows the module in the row.
- Importers re-published after didOpen/didChange/didClose of a file they import (tsserver's geterr on open files).
- Protocol order: before initialize a request gets -32002 ServerNotInitialized and notifications are dropped; after shutdown -32600 InvalidRequest; a second initialize -32600; exit always heard (LSP 3.17).
- The .d.ts read no longer sticks on failure (read again until it succeeds); ModuleInfo keeps 'import * as ns' aliases (src/frontend/ast.h, modules.cpp) and the server uses them before the old path guess.
- Decision: auto-import edits are sent in the items (no completionItem/resolve): one server, small lists filtered by prefix; tsserver and rust-analyzer resolve lazily because their indexes are large.
Tests: tests/run --only lsp (sections 10-13 new: four completion positions, rr -> rrect with its edit both ways, an export of a sibling file, importers re-published, request order), modules, import_type, Atelier selftest (replaceAt, auto-import item) pass.
Research: LSP 3.17 lifecycle (microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification); typescript-language-server includeCompletionsForModuleExports and additionalTextEdits on resolve (github.com/typescript-language-server/typescript-language-server/blob/HEAD/docs/configuration.md); rust-analyzer auto-import the same way (rust-analyzer.github.io/manual).
Proposed tests: atelier_ide (popup rows now show '· module' for auto-imports only; a session typing rr then Enter in a sketch to see the import line added).
Later: several signatures for overloads and signature help inside an object literal argument; auto-import from the plugins a project adds; Atelier can drop zinc check after a save now that importers are re-published.
<!-- SECTION:NOTES:END -->
