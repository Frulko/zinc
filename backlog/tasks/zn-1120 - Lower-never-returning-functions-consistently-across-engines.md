---
id: ZN-1120
title: Lower never-returning functions consistently across engines
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 09:51'
labels:
  - compiler
  - ir
  - bug
  - size-S
milestone: m-13
dependencies: []
ordinal: 8901
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A valid never-returning function passes zinc check and runs on QuickJS, but interpreter/AOT lowering fails Z0005 this type in the IR, even when the function is unused. This blocks runtime execution of the unchanged tests/data/open_record_methods/type-namespace.ts regression found while working ZN-1030. Minimal source and development-Mac proof: .logs/blockers/never-return/repro.ts plus check.log/interp.log/quickjs.log; common engine f34fc9e9. Preserve the original source and fix the shared representation/lowering; no caller rewrite, no weakening of never semantics. Work immediately after current core checkpoint; 668 currently owns lower.cpp, so research only until it freezes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unchanged namespace fixture and a minimal unused never-returning function check and run with the same result on interpreter, AOT and QuickJS
- [ ] #2 Called throwing never functions preserve caught exceptions and unreachable control flow on all three engines without manufacturing a return value
- [ ] #3 An exact stage regression preserves existing diagnostics for invalid return values and covers the original never-return IR failure
<!-- AC:END -->
