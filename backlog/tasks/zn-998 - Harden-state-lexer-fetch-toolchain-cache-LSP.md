---
id: ZN-998
title: 'Harden state: lexer, fetch, toolchain cache, LSP'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:48'
updated_date: '2026-11-06 07:58'
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
- [x] #1 Lexer: a template literal inside a JSX expression restores the JSX depth and mode; unmatched closing tags give a diagnostic, not a negative depth; regression test
- [ ] #2 HTTP fetch: a redirect or TLS 1.2 retry with no open TCP handle still restarts instead of hanging; regression test with a local server
- [x] #3 Toolchain fetch and source-tool install take a file lock, so two zinc processes installing the same tool at once both succeed; regression test
- [x] #4 LSP: didChange updates the document version; didChange on an unopened document is ignored; regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked in a parallel worktree (2026-11-06). Each case reproduced first.
- #1 Lexer: reproduced. A template substitution did not save the JSX depth (frame 't' saved 0), so `${</b>}` at top level leaked depth -1 and the next element lexed as code (`<Text>y</Text>`: y an Ident, </ an error token). An unmatched </x> made depth negative. Fix (src/frontend/lexer.cpp): the 't' frame saves and restores depth, a substitution starts at depth 0; </x> never takes depth below 0; /> clears tagClosing. The JSX lowering (src/frontend/jsx.cpp, unmatchedClose) reports a </x> met outside any element: 'Z0002 JSX: closing tag </View> has no opening tag'. Test: tests/t0/lexer.sh (two new checks; fail on the old binary). parser, checker, jsx, jsx_banned, jsx_style, react_class, react_native, solid_index, jsx_narrow pass.
- #2 HTTP fetch: NOT reproduced, left unchecked. Every place that sets restart (onComplete redirect, the TLS 1.2 retry in onFetchRead) runs inside a read of an open TCP handle, and closeTcp then closes it with tcpOpen true, so onFetchClosed always restarts. tcpOpen is false only before connectTo (DNS lookup, no bytes can arrive) or while a close is already pending (onFetchClosed restarts). No code path reaches restart with no handle; nothing changed.
- #3 Toolchain: reproduced with tests/t0/tc_fetch_lock.sh (4 concurrent installs of one pinned archive: tar 'File exists' and failed installs without the lock). Fix: FileLock (flock on <dir>.lock, src/tc/tc.h) taken by fetchTool and ensureSourceTool, the marker re-checked under the lock; plugin_build's BuildLock now uses the same FileLock. New hidden-free subcommand used by the test: zinc toolchain fetch <url> <sha256> <dir> <marker>. Tests: tc_fetch_lock, tc, plugin_stamp pass.
- #4 LSP: reproduced (version never updated, didChange on an unopened URI created a document and published diagnostics). Fix (src/lsp/lsp.cpp): didChange ignores unopened documents and stores textDocument.version; publishDiagnostics carries version. Test: tests/lsp/lsp_test.py step 7b (fails on the old binary); lsp passes.
<!-- SECTION:NOTES:END -->
