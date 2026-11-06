---
id: ZN-998
title: 'Harden state: lexer, fetch, toolchain cache, LSP'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:48'
labels:
  - size-M
  - engine
  - hardening
dependencies: []
ordinal: 757080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (engine core and host sections). Reproduce each case first; drop what does not reproduce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lexer: a template literal inside a JSX expression restores the JSX depth and mode; unmatched closing tags give a diagnostic, not a negative depth; regression test
- [ ] #2 HTTP fetch: a redirect or TLS 1.2 retry with no open TCP handle still restarts instead of hanging; regression test with a local server
- [ ] #3 Toolchain fetch and source-tool install take a file lock, so two zinc processes installing the same tool at once both succeed; regression test
- [ ] #4 LSP: didChange updates the document version; didChange on an unopened document is ignored; regression test
<!-- AC:END -->
