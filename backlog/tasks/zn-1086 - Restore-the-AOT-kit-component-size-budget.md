---
id: ZN-1086
title: Restore the AOT kit component size budget
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 13:57'
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
- [ ] #1 Unchanged kit_size AOT and JS gates pass on integrated kit source without budget or public behavior changes; artifact attribution records what was removed
- [ ] #2 Small exact regression protects the chosen reachability/inlining/metadata optimization and relevant type/exception behavior across interpreter AOT QuickJS; hot ABI remains conservative
- [ ] #3 One target build and bounded original kit smoke pass; notes record source provenance, actual sizes, limitations and proposed milestone checks
<!-- AC:END -->
