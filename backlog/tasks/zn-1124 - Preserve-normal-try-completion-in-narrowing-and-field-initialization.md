---
id: ZN-1124
title: Preserve normal try completion in narrowing and field initialization
status: Done
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
- [x] #1 The original try/catch cleanup repro and initialized-field reads check and produce the same expected output on interpreter, AOT and QuickJS.
- [x] #2 Focused negative controls still reject uninitialized normal constructor exits, catch fallthrough, conditional writes, reads before initialization and finally null/reset or return overriding throw.
- [x] #3 The unchanged natural ZN-1039 player and editor cleanup sources check with the corrected engine, without assertions, dummy initializers or try/catch rewrites.
<!-- AC:END -->

## Implementation Notes

2026-11-12: implemented in the shared checker only. True reset base d68999817d3b8a170e5b27fcf645434152ca54d3. A local completion summary keeps normal/return/throw/break/continue outcomes distinct for field initialization and applies finally to each outcome. Constructor read-before-assignment follows direct statements and restores branch/handler entry. Try/catch joins only normal exits; finally preserves or changes them according to its own effects. Ordinary if joins all relevant facts. Unmodeled conditional/loop/switch writes invalidate possible facts conservatively, rather than inventing a full CFG. Numeric joins normalize only assignable values to a unique declared numeric storage member; no assignability, IR, runtime or ABI changes.

Primary research and retained evidence: .logs/research-try-j.txt in the main tree, original source/proof copied to this worker's .logs/original-try-init.ts/.log, and docs/reports/zinc-next-try-flow.md. TypeScript6 strict accepts the original/positive source. Existing types, handler cell marking, catch scopes and all runtime backends remain unchanged.

Proof: final own relative tools/build zinc passes through the shared bounded work queue. Exact try_flow passes: two positive programs on interpreter/native AOT/QuickJS and 25 negative programs, including reads before initialization/right-hand-side read, catch fallthrough/return, conditional writes and resets, finally return overriding throw, finally reads, shadowed catch parameters, ternary/logical/loop-break writes and numeric union safety. Numeric controls preserve a fractional number and unsigned high bits. Original natural ZN-1039 player19-file and editor36-file checks pass using the candidate binary with ZINC_ROOT set to the parked app tree; all ten app/test/task payload hashes match before/after. No caller assertions, dummy initialization, try/catch rewrites or source changes were made. Actual pinball lifecycle execution is the still-open1039 task, not claimed by typecheck.

Failures retained in full .logs: first own C++ build needed the existing Fact alias moved before helper signatures; stage3 editor check found this change's number/i32 join regression and led to the local declared-storage normalization. A newly added fractional optional-machine probe failed on QuickJS; a separate no-try probe on the old6121edcc8 engine proves the same D224 boundary (VM/AOT2 and3, QuickJS2.75 and3.75). Original fractional source, failure, baseline logs and hashes remain under .logs/d224-optional-store. Final review found a real ordinary-if regression from invalidating a whole block after a loop even when a later assignment was certain (old6121/TS accepted, stage5 refused); stage6 moves invalidation to the individual expression/statement. A second review probe found a stale non-null guard fact after a conditional RHS reset (TS rejected, stage6 accepted); stage7 invalidates conditional guard writes again after guard facts are pushed, before each branch. Both failed sources/proofs remain in .logs/if-after-loop and .logs/guard-write. Positive later-assignment controls and the stale-guard negative are committed. Final machine-flow controls use exactly representable values; the number-declared fractional control remains. No separate gap/task or QuickJS transform change is claimed.

Existing V8 SDK and NanoSVG build warnings plus duplicate-library linker warnings are retained; none comes from changed checker code. No suite, T1/T2, tests/demo, pixel compare, benchmark, conformance, fuzz, CI, device or OS action. Conservative analysis can still reject valid complex loop/switch/conditional transfers; D224 optional numeric store coercion and broader checker coverage are not resolved.

Decision proposal: retain separate normal and abrupt completion summaries plus the existing fact model, rather than a general CFG rewrite or application assertions. This fixes real cleanup callers while rejecting incomplete construction, and keeps storage conversions at their original assignment sites.

Later proposal: keep D224 optional machine-number store coercion on QuickJS visible; the no-try baseline proves this independent syntax-only boundary, not a try-flow regression. Extend conservative loop/switch/conditional normal-transfer precision only with a real caller and focused controls.

### Proposed tests

- At the owner-selected checker milestone: existing nullable_cleanup, nullable_numeric, checker constructor/catch/finally expectations and closure_arity (seconds to a minute, memory unmeasured); the exact new T0 and original cleanup caller checks already pass.
- Resume ZN-1039's prepared lifecycle T0 and short actual player/editor release proof with this engine (bounded short run, resource counts rather than RSS); no app execution or native reclamation claim is made here.

Usage: `tools/usage` reported `usage: n/a`; no usage estimate is invented.

2026-11-12 coordinator L: reopened after original unchanged iPod103-file check exposed a regression introduced by8975a1c6d: four existing kit optional-property narrowings now fail. Same source/tree with archived old6121edcc8 CLI passes; compact four-case source and both logs are preserved under .worktrees/1037-remote-wire/.logs/remote1037/kit-narrowing.ts, kit-current8975.log and kit-old6121.log. Current examples: guarded callback after conditional getter, early-return guarded callback, compound guard optional number, nested guarded callback with argument call. Correct shared checker transfer precision without changing callers or dropping existing conditional-write negative safety; keep original try-flow proofs. All earlier proofs remain true, but task is reopened until this source regression is fixed. No app workaround.

2026-11-12 worker repair of the reopened regression: `resetAssigned` retains its existing loop/handler call policy by default; conditional/short-circuit forms use actual writes only, skipping dormant function/class bodies and including directly invoked function-expression bodies. No receiver-call reset is replayed over an already evaluated guard. Explicit conditional writes still reset the target and dependent paths. Scope is only the shared checker, focused try_flow fixtures/runner, docs and this task/changelog.

Proof: own relative tools/build zinc under work-run600 exits0, `.logs/build-1124-stage1.log`. Exact try_flow stage2 passes three positive programs on interpreter/native AOT/QuickJS and all28 negative controls, including the original25 plus member/parent/IIFE guarded resets; `.logs/try-flow-stage2.log`. Original compact four-kit source passes and original iPod103-file app passes using this candidate in remote1037 tree, with622 source payload hashes unchanged; remote stage-1124-checks retains compiler manifest and logs. Own unchanged pinball25-file player and36-file editor checks pass. TypeScript6 strict accepts the four-case runtime source with moduleDetection Force (`.logs/typescript-guard-1124-stage2.log`). First TS check used script scope and collided with DOM global `external`; full failed log retained, source unchanged. First added runtime fixture used function-valued `&&`, rejected by Zinc's strict boolean rule; original failed stage log retained and unused fixture expression removed, with full exact T0 rerun. Existing NanoSVG and duplicate-library warnings retained; no changed-checker warning.

The original ipod-web caller check reached its60s bound without a diagnostic; sourceworker preserved `.logs/remote1037/stage-1124-checks/ipod-web.log`. No successful ipod-web check is claimed here. Coordinator owns any bounded comparison. No suite, T1/T2, app execution, device/network/OS action or performance claim. All3 original criteria remain satisfied; the source regression is repaired.

Proposed decision: retain conservative call effects only where the original loop/handler analysis needs them; replay actual conditional writes rather than unrelated getter calls when normal-transfer facts are incomplete.
Proposed tests: existing broader checker/property-path/closure milestone (seconds to a minute, memory unmeasured), selected by owner; exact guard runtime and unsafe-write checks already pass.

2026-11-12 coordinator M verification: source2b602f2e4 integrated ALONE as da1bd8e31 during the owner export emergency; no1125/1126/1127 source was included. The owner-context MAIN rebuild and real app/sidecar-screen and app/sidecar typecheck/pack/fuse/signed exports pass, with both signatures verified deep/strict. Root's separate shared bundle licence fix is4d0630934. MAIN runtime/UI WIP is not a clean compiler baseline. Proof identity correction: the earlier25-file check was examples/pinball (2D), not merely extra native dependencies; the actual cleanup player examples/pinball3d was subsequently checked successfully (19files) on the later private candidate, and the editor36-file check was correct. Authentic earlier logs remain unchanged. Full correction is also preserved by worker commitd3860cd5f, not yet integrated.1124 remains Done; remaining engine tasks are separate and unintegrated.
