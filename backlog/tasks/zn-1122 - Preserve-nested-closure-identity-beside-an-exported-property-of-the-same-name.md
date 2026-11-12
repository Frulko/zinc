---
id: ZN-1122
title: Preserve lexical bindings and arity in deferred array callbacks
status: Done
assignee: []
created_date: '2026-11-12 03:38'
updated_date: '2026-11-12 03:45'
labels:
  - compiler
  - size-S
dependencies: []
type: bug
ordinal: 53201
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-558 generic GATT simulator cannot compile its natural TypeScript. A predicate parameter shadows the variable being initialized (`const item = items.find(item => ...)`), but textual self-reference detection defers it and later pads its parameters differently from the generated array helper. Preserve lexical bindings and deferred callback arity without renaming caller helpers or weakening IR validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The minimal named helper plus same-name exported arrow and nested Array.find compiles and prints found on interpreter, AOT and QuickJS
- [x] #2 A small exact T0 regression covers lexical closure identity and the original BLE simulator compiles unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: textual mentionsInLambda treated a predicate parameter as an outer result reference. Array helper recorded fn(Item), then deferred checking with default padding changed the same closure to fn(Item,i32). Same failure reproduced without exported object, so readable closure/property names were incidental. Reused existing lexical fnMentions traversal; corrected its catch-binding scope so finally sees the outer binding. DeferredSelf also preserves callback padding policy and restores it with RAII. All three mentionsInLambda callers and the complete selfDeferred producer/consumer were read; both existing fnMentions callers retain their traversal with more exact catch scope. No IR verifier, lowering, runtime or BLE source changes.

Proof: own queued build and incremental frontend rebuild pass; no frontend warning. Existing SDK V8 header/agent dev.cpp missing Program.args and duplicate-library linker warnings remain outside scope (full logs .logs/build.log and build-final.log). Exact tests/run --only closure_arity PASS all3: original imported same-name helper/property, standalone shadow, genuine deferred capture, nested predicates, catch/finally. zinc check main fixture PASS. Common readonly pre-fix binary fails both original imported and standalone cases with unrelated-class refcast (negative.log, negative-local.log, bad.ir). Original unchanged BLE simulator check/interpreter/QuickJS/native compile+run PASS and prints ble generic GATT simulator ok; before/after source SHA equal (.logs/ble-*.log, ble-source-*.sha256). First proof harness had a wrong manifest path and stopped before running anything; corrected to native/ble.sim.ts, failure log retained.

Research: delegated research spawning and coordinator followup both rejected by runtime thread limit. Coordinator supplied primary sources (.logs/research-1122-f.txt): https://github.com/llvm/llvm-project/blob/main/clang/include/clang/AST/DeclCXX.h and https://github.com/llvm/llvm-project/blob/main/clang/lib/Sema/SemaLambda.cpp keep lexical declaration context separate from display names; https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API resolves AST-node symbols. Inference: reuse lexical identity analysis, no naming framework or dependency. Proposed decision: retain lexical self-reference analysis and original callback arity policy during deferred checks. No later.md line needed. Proposed tests: owner-selected recursive_self and tdz_locals exact regressions (~seconds each, memory unmeasured) for broader existing caller coverage; suites/T1/T2/benchmarks not run. Usage: n/a. No owned process remains.
<!-- SECTION:NOTES:END -->
