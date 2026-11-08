---
id: ZN-1020
title: >-
  zinc lsp: completion in imports and JSX, auto-import, re-publish dependents,
  request order
status: Backlog
assignee: []
created_date: '2026-11-07 16:35'
labels:
  - lsp
  - tools
  - size-M
milestone: m-20
dependencies: []
ordinal: 3000
updated_date: '2026-11-07 18:30'
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
- [ ] #1 completion lists work in the four positions in an lsp T1 test
- [ ] #2 typing `rr` proposes `rrect` and adds the import
- [ ] #3 editing a module re-publishes its importers
- [ ] #4 requests before initialize get the LSP error
<!-- AC:END -->
