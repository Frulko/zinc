---
id: ZN-1127
title: Check fluent call receivers once per dispatch
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-12 10:47'
labels:
  - language
  - frontend
  - perf
  - size-M
milestone: m-7
dependencies: []
ordinal: 17504
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the original ZN-1037 sender-roundtrip and ipod-web compilation: unchanged trackEl has about46 fluent calls and times out during compilation. A dependency-free Chain.next() repeated40 times also times out under a5-second check; XML import plus one .s passes. Research .logs/research-fluent-chain-m.txt identifies callExpr dynamic receiver probes checking expr(receiver), then normal Member fallback checking the same receiver again, recursively doubling prefix work. Reuse the freshly checked receiver only within the same call dispatch/member-resolution context; never install a global nodeType cache, split application chains or weaken flow checks. Scope shared checker and focused T0/fixtures/mapping/docs only; no RT/IR/ABI/HAL/host/UI/main edits. Original failures/sources live in .worktrees/1124-1125-boundaries/.logs/production1037-stage6 and sender-blocker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An unchanged dependency-free40–64-link fluent chain checks within a short functional timeout and produces the expected output on interpreter, actual native AOT and QuickJS; ordinary and specialization-name fallback chains are covered.
- [x] #2 Focused receiver/key/argument ordering, exactly-once effects, dynamic/optional calls, contextual callbacks and flow/private/arity/type-error controls retain correct behavior without cross-statement or cross-branch stale receiver facts.
- [x] #3 Original ZN-1037 sender-roundtrip and atomic library consumer pass all three engines without caller chain splitting; after the minimal fix passes, one bounded original ipod-web check verifies the affected real compilation path without launching a daemon.
<!-- AC:END -->


## Implementation Notes

2026-11-12: resumed the existing caa7e7155 tree without reset/rebase after the owner export emergency. The preserved checker change is the complete repair: call-local lazy CheckedReceiver stack, explicit Pending/Checking/Ready/Failed transitions, RAII depth restoration, indices safe across nested vector reallocation, same-node/function/class/syntax/type validity and expected-type invalidation. No global node cache, purity change, chain splitting, runtime/IR/ABI/host/HAL/UI/main change or dependency. Existing normal member accessibility/optional/method-value/argument paths remain responsible for their checks. Source SHA256 d7ec698df67423881f273991ee41aaf47ffa71a74a9d4eeb4d81974cc939067b matches the parked source and completed warning-free changed-code build `.logs/build-1127-stage1.log`; no later source rebuild was needed. Current CLI SHA256 8fb03ae2ff442a5d0958cf86b9d11f08457acf240a8c894bfbeed0584fa097de (compiled from the WIP over caa7e7155, not identified from version text).

AC1/2: `.logs/fluent-1127-stage3.log` PASS: bounded5s check, 64 next links and48 specialization-name fallback links, all3 expected counts and effects; static getter, computed dynamic key, indexed callback and argument order, optional short circuit, dynamic array/string, collection callbacks and contextual generic inference; six negatives cover private/arity/type/missing/non-callable/stale-flow rejection. Actual native app+inputs/key/provider metadata preserved in `.logs/fluent-1127-stage3/native`. Original40-link pure failure timeout124@5s remains `.logs/sender-blocker/chain-mini-check.log`; this is functional termination evidence, not a benchmark. Exact affected `.logs/try-flow-1127-stage1.log`, `.logs/checked-nullish-1127-stage1.log`, `.logs/checked-imports-1127-stage1.log` all PASS. Full used checker/QJS/include/lib/test/config source and compiler manifests precede each stage under the matching `.logs/*-1127-stage*/` snapshots.

Authentic initial fluent T0 stage1 hit an inherited extracted-method lowering bus error; `.logs/fluent-isolation-stage1/method-value.ts`, `effects.ts`, `effects.log`, `lldb.log` and `method-value-before.log` retain the minimal source, failing current run, IR location and identical failure on proven frozen final-stage6/dd5c. Isolated chains and effects excluding that additional extracted-method call passed. Coordinator explicitly held IR scope; the committed `method-value-check.ts` is a STATIC control only, never claimed runtime coverage. Stage2 all3 passed but the stale-flow negative expected the wrong diagnostic (actual Z0107); stage3 corrects only that test expectation and passes. No failure log/source relabelled or overwritten.

AC3: `.logs/production1037-sender-1127-stage1/` proves the ORIGINAL production sender-roundtrip all3, with exact serializer bodies and no caller edits. Native log shows7 C++ units/link/run native, no fallback; actual app, inputs/key/provider metadata retained. Full622 source payloads before/after unchanged; compiler manifest identifies CLI8fb03. Earlier `.logs/production1037-stage6/` wire and `.logs/production1037-consumer-stage6/` atomic readLibrary consumer already passed all3 with actual native under frozen CLI dd5c1e73c89a1468bf860bfe74a943f853b2a2fe4435abf259e35ec03d33a4f1; no rerun without cause. After minimal+sender proof, the one authorized unchanged original ipod-web check passed18files under inner30/work-run60: `.logs/production1037-web-1127-stage1/`, all622hashes unchanged. Original ipod103 prior pass retained, not repeated. No daemon/network/device/database/cache write; isolated backup paths remain absent.

Research consumed from coordinator `.logs/research-fluent-chain-m.txt`: TypeScript checker-owned cache lifetime https://github.com/microsoft/TypeScript/wiki/Codebase-Compiler-Checker#caching-data-while-checking and context-owned mapper caches https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/#cache-instantiations-on-mappers . Narrow scoped handoff fits mutable Zinc AST/flow; no library needed. Module note `docs/reports/zinc-next-fluent-receivers.md` records semantics and limits.

Proposed later line: ZN-1127: extracted instance method with contextual lambda crashes in IR lowering on both frozen dd5c and1127; reproduce `.logs/fluent-isolation-stage1/method-value.ts` with `zinc run ... --interp`, preserve static control until shared lowering is repaired. No task/D number created here.

Proposed tests: owner-selected broader checker/three-engine matrix at a milestone; duration and memory unmeasured. No suite/T1/T2/demo/pixel/conformance/fuzz/benchmark/CI, cross target or actual daemon run. No performance claim. All manual heavy commands used work-run sequentially, headless and bounded; no owned process remains. usage: n/a.
