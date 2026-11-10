---
id: ZN-668
title: 'Runtime: a closure that refers to itself is never freed'
status: Review
assignee: []
created_date: '2026-10-10 18:50'
updated_date: '2026-11-10 09:54'
labels:
  - runtime
  - bug
  - size-S
dependencies: []
ordinal: 16400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) Noted in a task in Review and never filed: `const f = () => { ... f ... }` keeps a reference to itself, so its environment is never released (live objects are not 0 at exit).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program with a self-referring closure exits with 0 live objects on the interpreter and the AOT (test)
- [ ] #2 the cost on the closure call path is measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint, 2026-11-10 (worker work/668, base 8fa997cdb):
- Scope: src/ir/lower.cpp only for engine code, plus focused recursive_self T0/fixture/output, affected mapping and changelog. Read every capsOf/readSym/storageOf caller and the related checker/selfSym/cell creation paths. No runtime/header/VM/AOT/checker/CMake, owner WIP or shared session files changed.
- Generalize existing recursive declaration receiver binding to direct const FuncExpr initializers and named FuncExpr internal names using Symbol.decl. Only a closure's own immutable binding is excluded from captures. Self reads return its actual receiver object; nested callbacks own the existing temporary self cell. Keep reassigned/isCell/lateCells and outer predeclaration unchanged, preserving hoisted sibling captures and dynamic let reassignment.
- Research reused from the completed read-only investigation: Swift capture optimization requires immutable bindings (https://docs.swift.org/latest/documentation/the-swift-programming-language/closures/); ARC ownership must preserve lifetime (https://github.com/swiftlang/swift-book/blob/main/TSPL.docc/LanguageGuide/AutomaticReferenceCounting.md); weak references need coordinated runtime machinery (https://clang.llvm.org/docs/AutomaticReferenceCounting.html); QuickJS uses separate cycle removal (https://www.bellard.org/quickjs/quickjs.html#Garbage-collection).
- Proposed decision: receiver binding reuses proven existing semantics with no new runtime machinery. Design scores under RULES section 4: receiver binding 70/70, weak capture 44/70, general cycle collector 39/70 (design judgments, not measured speed). Generic weak capture can break escaped ownership; a new collector broadens this immutable self-binding bug. Revisit for arbitrary cyclic object graphs; no decision number allocated in this worker.
- Proof: tools/build zinc succeeds; no warning in changed lower.cpp. Fresh build reports existing unrelated warnings including vendor rg_etc1/nanosvg and src/agent/dev.cpp, not edited. zinc check recursive_self succeeds. Exact tests/run --tier t0 --only recursive_self passes all three engines, interpreter/native with ZN_LEAK_CHECK, and JSON asserts allocs=frees=44 and leaked=0. Fixture covers escaped recursion, external state mutation, nested self identity, named expression internal identity after outer holder reassignment, hoisted sibling before const initialization, dynamic let control that breaks the old cycle, caught throws and bounded timers after factory exit.
- Original unchanged factorial reproducer still prints 24. Before (read-only shared f34fc9 binary): interpreter/native exit 4 with two leaked objects/48 bytes. After (worker SHA256 61f99ec45071021380e5c8ca69643a534197f888310a54b927d7f93b2382372d): interpreter allocs2/frees2/leaked0, peak2 objects/40 bytes; native ZN_LEAK_CHECK exit0. These are ownership counts, not a call-path cost claim. Full fixture peak16 live objects/616 bytes; RSS is incidental under concurrent work and not a performance result. Logs: .logs/closure-668/{mem.json,mem.log,original-native.out,original-native.err}; prior baseline/design: main .logs/archive-completed-workers-20261110/668-research/logs/closure-668/design.md.
- AC1 passes. AC2 remains unchecked: no benchmark or quiet call-path measurement authorized, so status Review. Next command after owner chooses that milestone: run a matched before/after closure call-path measurement on a quiet machine and record it here. No suite/T1/T2/demo/benchmark/conformance/fuzz/CI run.
- Limits: mutable, mutual and arbitrary object/callback cycles keep strong ownership. Zinc's strict TS profile rejects var with Z1001 (use let/const), so no new var syntax support was added. The let fixture proves dynamic reassignment semantics; plain-JS QuickJS semantics remain unchanged. No child process remains.
- Proposed later.md line: ZN-668: measure immutable recursive closure call-path cost on a quiet machine; semantic and zero-leak proofs pass, but AC2 remains open.
- usage: n/a

Proposed tests:
- Existing tests/run --tier t0 --only recursive_local: previous recursive function declaration and bounded callback lifecycle coverage, seconds, estimated <100 MB; not rerun by worker.
- Owner-selected matched before/after closure call-path cost measurement: satisfies AC2, estimated seconds to minutes and <100 MB, only on a quiet machine.
<!-- SECTION:NOTES:END -->
