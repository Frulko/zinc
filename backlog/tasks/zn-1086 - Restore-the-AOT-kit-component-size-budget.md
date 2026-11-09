---
id: ZN-1086
title: Restore the AOT kit component size budget
status: Done
assignee: []
created_date: '2026-11-09 13:57'
updated_date: '2026-11-09 13:58'
labels:
  - perf
  - ui
  - size-M
milestone: m-32
dependencies: []
type: bug
ordinal: 1007
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the unchanged tests/t0/kit_size.sh gate on integrated Selection ZN-1078.08 (AC3), and new Inputs. At53009551b the native direct/index/ten binaries are5506440/5605520/6200256 bytes: average additional used component66081 exceeds65536, while unused-family and JS budgets pass. Restore the existing gate with an engine fix attributed to retained code or metadata, never by weakening a budget, deleting kit behavior or changing valid application code. D268 explicitly deferred class metadata compaction until a later gate failure; that condition is now met, but choose the smallest measured fix rather than presuppose it.

Existing artifacts: .worktrees/1078-inputs/.logs/inputs-size contains generated CPP/ZBC/resources, symbols, loadcommands, function-rows.json. Old one→ten:391→540 functions,81441→112969 IR instructions,476→617 classes; text+568432, const+12352, dataConst+1664, resource+458. Mach-O text segment grows9×65536 and LINKEDIT4912: save at least a text page. Repeated lambdas approach~985 instructions, and TDZ before-init sites860→1264. Research agent found __tdzChk remains a separate23/24-instruction helper; do not assume cloned Error construction. TDZ guard removal must preserve reads, initialization ordering and exceptions. Identical rounded artifact sizes on two branches do not demonstrate a stale cache.

Inspect reachability/type metadata and inlining attribution before editing. Keep interpreter/AOT/QuickJS behavior aligned; preserve hot reload ABI IDs, worker/native registrations, reflection/type checks, exceptions and valid polymorphic classes. No new dependency. Main has other-session runtime/LVGL/host WIP; do not edit those modules. Primary research collected before task: https://llvm.org/docs/TypeMetadata.html , https://llvm.org/docs/Passes.html (GlobalDCE), https://webkit.org/blog/2826/unusual-speed-boost-size-matters/ , https://www.llvm.org/docs/doxygen/PartialInlining_8cpp_source.html . These inform alternatives, not proof that one fits Zinc. Build only tools/build zinc, short exact regression, unchanged kit_size once after attributed change; no broader benchmarks/suites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unchanged kit_size AOT and JS gates pass on integrated kit source without budget or public behavior changes; artifact attribution records what was removed
- [x] #2 Small exact regression protects the chosen reachability/inlining/metadata optimization and relevant type/exception behavior across interpreter AOT QuickJS; hot ABI remains conservative
- [x] #3 One target build and bounded original kit smoke pass; notes record source provenance, actual sizes, limitations and proposed milestone checks
<!-- AC:END -->

## Implementation Notes

- Source: eb8fb5016 (integrated Selection, old Input/new Slider), kit tree b2e057fbe166d679caa88510ee996343fce3af0b. No kit source changed. The unchanged gate blob is 6a48f4029761d172c6e953bff5154e4a39e36d2e.
- Attribution: the supplied ten.zbc.txt shows full ReferenceError construction inside TextField closures, not merely flag reads (lambda170 pc85–104 and135 onwards). A separate surviving generic helper did not rule out inlining at other sites. Fresh same-source Button ZBC with the clean pre-change binary has859 ReferenceError allocation sites /103139 instructions; the changed compiler has1 /88928. These are ZBC instructions, not native bytes. The small exact regression changes11 allocation sites to1.
- Smallest fix: the compiler-generated TDZ prelude shares its throw in one non-returning __tdzFail function. The existing inliner refuses callees with no return; __tdzChk still inlines the guard and freshly evaluated value, but not the exceptional construction. No optimizer heuristic, guard deletion, metadata compaction, ABI table change, native registration change or kit workaround. Hot/debug mode remains conservative through its existing paths.
- Research supplied before implementation: LLVM TypeMetadata and GlobalDCE (https://llvm.org/docs/TypeMetadata.html , https://llvm.org/docs/Passes.html), WebKit size work (https://webkit.org/blog/2826/unusual-speed-boost-size-matters/) and LLVM partial inlining (https://www.llvm.org/docs/doxygen/PartialInlining_8cpp_source.html). Measured cold-body duplication, rather than compressed class tables, chose outlining. Reuse existing inlining rule scores fit/performance/size/maintainability/licence/portability/effort5/5/5/5/5/5/5=70; broad metadata compaction3/4/3/3/5/4/2=49. No dependency added.
- Fresh target build through tools/build zinc passed; no changed-source warnings. Existing warnings from vendored V8/rg_etc1/nanosvg and src/agent/dev.cpp remain outside this task.
- PASS exact T0 tdz_outline on interpreter/AOT/QuickJS: ReferenceError and engine-specific original messages before init, reads during initializer, later side effects skipped after failed reads, fresh mutable number/string/reference values, subclass virtual dispatch and instanceof. QuickJS keeps its existing native '<name> is not initialized' message. The new test fails its allocation-count assertion on the old compiler (11 instead of1).
- PASS unchanged kit_size: AOT direct5440392/index5539472/ten6101184 B; unused99080 <=118784 B, used-component average62412 <=65536 B. JS227563/228435/245550 B; unused872 <=7424 B, used-component average1901 <=4096 B. Quiet-runner proof passed, then one direct unchanged-script invocation retained numeric evidence because the runner deletes successful detailed logs. Earlier integrated Selection measurements were5506440/5605520/6200256 B, average66081.
- PASS ten-component zinc check and original Button headless deterministic two-frame interpreter smoke (exit0). All heavy commands used /tmp/zinc-heavy-run-501.py with bounds. No process left running.
- Artifacts: .logs/kit-size/{build.log,regression.log,regression-before.zbc.txt,one-before.zbc.txt,one-after.zbc.txt,gate.log,gate-sizes.log,check.log,smoke.log}; baseline compiler /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc with ZINC_ROOT pointing at this tree, changed compiler this tree's build/zinc. Initial attribution additionally read the coordinator-owned1078-inputs artifact directory; never modified it. Input/Overlay WIP source gates remain their workers' integration proofs.
- usage: n/a (tools/usage has no transcript for this worker).

## Proposed tests

- Owner-chosen milestone: hot_recompile and fast_refresh; stable helper keys and native ABI retention through edited-module reloads (seconds to a minute, ordinary app memory).
- Owner-chosen milestone: original kit gallery on interpreter/AOT/QuickJS and cross targets; rendering and polymorphic callback behavior after smaller TDZ paths (a few frames per engine, <300 MB expected). No suites, timing benchmarks, pixel compare or cross build run here.
