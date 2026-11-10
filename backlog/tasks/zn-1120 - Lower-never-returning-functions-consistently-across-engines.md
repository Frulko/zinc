---
id: ZN-1120
title: Lower never-returning functions consistently across engines
status: Done
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
- [x] #1 The unchanged namespace fixture and a minimal unused never-returning function check and run with the same result on interpreter, AOT and QuickJS
- [x] #2 Called throwing never functions preserve caught exceptions and unreachable control flow on all three engines without manufacturing a return value
- [x] #3 An exact stage regression preserves existing diagnostics for invalid return values and covers the original never-return IR failure
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read-only research checkpoint (2026-11-10): source d4d2b2b95; no engine changes, build or runtime probe. Coordination gate: 668 owns src/ir/lower.cpp until frozen; 603 owns the AOT emitter.

Primary sources: TypeScript 2.0 never rules require an unreachable endpoint and never-valued return expressions, with never assignable to all other types (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#the-never-type). LLVM already represents a normal continuation after a nonreturning call with unreachable (https://llvm.org/docs/LangRef.html#unreachable-instruction). Static TypeScript emitter separates return-value presence from runtime calling machinery, but has no explicit TypeFlags.Never handling in the inspected emitter, so it supplies no direct shortcut (https://raw.githubusercontent.com/microsoft/pxt/master/pxtcompiler/emitter/emitter.ts). No library is needed.

Root cause: frontend annotation maps never to tNull in check.cpp; there is no distinct Never kind/type. irType rejects standalone Null when constructing direct, closure and method return signatures (lower.cpp). Existing void IR calls have no SSA result, Throw/Unreachable already verify, ZBC encodes them as Throw/Trap and VM/AOT preserve unwind. QuickJS strips the source types and already works. Globally mapping Null to void is unsound for actual null-returning functions and keeps never conflated with a value.

Proposed coherent boundary for coordinator review: distinguish frontend Never without shifting existing fixed TypeIds; keep existing void IR representation, terminate a known-never normal call continuation with existing Unreachable and retain exceptional unwind. Where a typed expression context needs an SSA id, only a predecessor-free dead-block parameter may stand for the unreachable result, removed by existing lower cleanup; no literal or call return value. Review annotation, naming, assignability, union simplification, termination checks, direct/closure/method signatures, cond joins, and never-variable declarations. Generic risk: __withResolvers<T=never> and Promise<never> currently use the null placeholder, so generic and Dyn/inspect callers must be read and any changed behavior proved.

Proposed tests: exact never_return T0, containing unchanged namespace fixture runtime plus unused/throwing direct, closure and method calls, caught exceptions/finally, return fail(), typed branch/unreachable path, and invalid number/null/empty/fallthrough never returns. Run only that seconds-long exact check and short all-engine feature proofs after coordinator releases source/build gate; broader suites remain unrun.


Implementation completed in work/1120 (base 2a09d3584), 2026-11-10. Distinct appended TK::Never and canonical frontend TypeId 7 preserve fixed IDs 0–6 and existing kind numbers. Never is bottom for assignment/union/inference and has its own name/type-namespace lookup; null, numbers, empty returns and reachable fallthrough are rejected in never-returning functions. Known never computations end expression/initializer statements. Existing function thunks adapt () => never to valued function types.

Shared IR uses existing void return signatures for Never across direct functions, methods, closures, selectors and function representation keys. A known-never call keeps its exceptional unwind edge and ends only its normal continuation with Unreachable. A demanded result is represented solely by a parameter of a predecessor-free dead block, removed by the existing unreachable cleanup; no literal/result is fabricated. Standalone calls need no dead result or storage class. Never fields, parameters and empty collections use a lazy private empty __Never REF class with no source binding, constructor or instances; it is distinct from __Void. Existing vtable adapters now handle never-to-valued method covariance, and devirtualization retains those adapters. Existing trailing-argument compatibility is preserved. No VM, AOT emitter, runtime, ABI or opcode change.

Proof: latest tools/build zinc completed, with no warnings in touched-source incremental build (.logs/never1120/build7.log; clean initial build also surfaced existing third-party/other-source warnings). Exact tests/run --only never_return PASS on candidate SHA256 909dd32faf7da46975c5939c3b27f9f4102c70560c912d6ec6884f641fc8858f (.logs/never1120/test-candidate.log). Three fixtures each check and run on interpreter/AOT/QuickJS: unused plus caught pure throw, the unchanged original namespace fixture, and direct/closure/virtual calls, return fail(), typed joins/initializers, conditional terminal paths, () => number adaptation, Base:number/Derived:never, interface:number/implementation:never, ignored trailing arguments, catch/finally, nested uninhabited fields, empty never[], default withResolvers rejection and typed Promise<never> rejection through then(success, reject). Eleven invalid fixtures assert return/endpoint, assertion/storage-boundary and override diagnostics. Original open_record_methods now runs its namespace fixture on all engines as well; its broader exact script was not run.

IR proof (.logs/never1120/unused.ir, main.ir): pure throw-only fixture has void-returning unused/stop functions and no __Never class; no __Never object is constructed; all valued Derived/Implemented/FewerArgs adapters call the original void-never method then Unreachable. Emission verifies the module before dumping. git diff --check and affected JSON parse pass. tools/usage: usage: n/a. All proof commands bounded through the coordinator work-run queue, headless; no owned process remains.

Deliberate boundaries: assertions to never and conversions of an observed uninhabited never slot to an inhabited representation diagnose Z0005 before IR; an assertion alone is never treated as a nonreturning call. Dyn/inspect/JSON eligibility predicates reject Never projections rather than generating invalid adapters. Standalone real(): null { return null; } already fails Z0005 in the pre-1120 common engine, and still has its separate Null representation; it was not conflated with void or broadened. Default Promise<never>.catch(callback returning void) also fails in the pre-1120 common engine (generic null/undefined representation), reproduced in .logs/never1120/promise-catch-baseline.*; this task proves genuine resolver/typed rejection through then without broadening that unrelated Null gap.

Proposed decision: represent bottom distinctly in the frontend, use existing void/Unreachable for never-returning calls, and retain a private uninhabited REF storage carrier only where a slot is required. Keep unsupported assertions/projections explicit until their representation can be preserved. No new dependency or public format.

Proposed later line: - ZN-1120: add coherent standalone null/undefined return and generic storage support; real(): null and Promise<never>.catch(void) already fail in the pre-fix engine.

Proposed tests: tests/run --only open_record_methods after integration, to recheck existing borrowed/default-arity paths plus the now-runtime namespace case (estimated seconds to tens of seconds; memory unmeasured). Broader method/closure/exception corpus on all engines at an owner-chosen milestone (duration/memory unmeasured). No suite, T1/T2/demo, benchmark, fuzz, conformance, CI or hardware run was started.
<!-- SECTION:NOTES:END -->
