---
id: ZN-1120
title: Lower never-returning functions consistently across engines
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-11-10 09:51'
updated_date: '2026-11-10 09:56'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only research checkpoint (2026-11-10): source d4d2b2b95; no engine changes, build or runtime probe. Coordination gate: 668 owns src/ir/lower.cpp until frozen; 603 owns the AOT emitter.

Primary sources: TypeScript 2.0 never rules require an unreachable endpoint and never-valued return expressions, with never assignable to all other types (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#the-never-type). LLVM already represents a normal continuation after a nonreturning call with unreachable (https://llvm.org/docs/LangRef.html#unreachable-instruction). Static TypeScript emitter separates return-value presence from runtime calling machinery, but has no explicit TypeFlags.Never handling in the inspected emitter, so it supplies no direct shortcut (https://raw.githubusercontent.com/microsoft/pxt/master/pxtcompiler/emitter/emitter.ts). No library is needed.

Root cause: frontend annotation maps never to tNull in check.cpp; there is no distinct Never kind/type. irType rejects standalone Null when constructing direct, closure and method return signatures (lower.cpp). Existing void IR calls have no SSA result, Throw/Unreachable already verify, ZBC encodes them as Throw/Trap and VM/AOT preserve unwind. QuickJS strips the source types and already works. Globally mapping Null to void is unsound for actual null-returning functions and keeps never conflated with a value.

Proposed coherent boundary for coordinator review: distinguish frontend Never without shifting existing fixed TypeIds; keep existing void IR representation, terminate a known-never normal call continuation with existing Unreachable and retain exceptional unwind. Where a typed expression context needs an SSA id, only a predecessor-free dead-block parameter may stand for the unreachable result, removed by existing lower cleanup; no literal or call return value. Review annotation, naming, assignability, union simplification, termination checks, direct/closure/method signatures, cond joins, and never-variable declarations. Generic risk: __withResolvers<T=never> and Promise<never> currently use the null placeholder, so generic and Dyn/inspect callers must be read and any changed behavior proved.

Proposed tests: exact never_return T0, containing unchanged namespace fixture runtime plus unused/throwing direct, closure and method calls, caught exceptions/finally, return fail(), typed branch/unreachable path, and invalid number/null/empty/fallthrough never returns. Run only that seconds-long exact check and short all-engine feature proofs after coordinator releases source/build gate; broader suites remain unrun.
<!-- SECTION:NOTES:END -->
