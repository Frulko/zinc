---
id: ZN-1124
title: Preserve normal try completion in narrowing and field initialization
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 07:43'
labels:
  - language
  - frontend
  - size-M
milestone: m-7
dependencies: []
ordinal: 17501
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the natural resource-cleanup implementation of ZN-1039. A 16-line strict TypeScript program assigns a required constructor field inside try/catch(rethrow), and a nullable local inside try/catch(return); TypeScript6 accepts it, Zinc6121edcc8 reports Z0111 and Z0103. Preserve the original app try/catch and fix the shared checker, not caller assertions or assignability. Read .logs/research-try-j.txt and the parked source .worktrees/1039-pinball-lifetime/.logs/HANDOFF-1039-PARKED.md. Exact source/proof are .logs/try-init.ts, proof-try-init.sh and try-init.log in that tree. Causes: check.cpp N::Try discards all normal-exit facts, field initialization lacks Try, ctorPending only handles top-level assignment. Finally can override completion and must not make uninitialized constructors valid. Scope frontend/check.cpp and exact T0/fixtures/mapping/docs only; no runtime, HAL, host, UI or main edits.

Primary research: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#control-flow-analysis ; https://www.typescriptlang.org/tsconfig/strictPropertyInitialization.html ; https://raw.githubusercontent.com/microsoft/TypeScript/v5.9.3/src/compiler/binder.ts ; https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-try-statement-runtime-semantics-evaluation .
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The original try/catch cleanup repro and initialized-field reads check and produce the same expected output on interpreter, AOT and QuickJS.
- [ ] #2 Focused negative controls still reject uninitialized normal constructor exits, catch fallthrough, conditional writes, reads before initialization and finally null/reset or return overriding throw.
- [ ] #3 The unchanged natural ZN-1039 player and editor cleanup sources check with the corrected engine, without assertions, dummy initializers or try/catch rewrites.
<!-- AC:END -->
