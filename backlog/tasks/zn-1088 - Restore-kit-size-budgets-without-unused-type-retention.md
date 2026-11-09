---
id: ZN-1088
title: Restore kit size budgets without unused type retention
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:36'
labels:
  - perf
  - ui
  - size-M
milestone: m-32
dependencies: []
type: bug
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks integrated Inputs ZN-1078.06 and Navigation ZN-1078.09 size AC. After natural capability splits (plain Input vs PasswordField, basic Tabs vs rich NavigationTabs) and TDZ outlining c69f4e7a8, unchanged gates still fail. Inputs: unused132104 B >118784; used75262/component >65536. Navigation: unused132104 >122880; used66083 >65536. JS passes. No further UI trims or budget increases. Both progress branches are now integrated (0a8c0b141,3dde12a02); reproduce/attribute the combined source, not an old baseline.

Inputs current emit-only evidence .worktrees/1078-inputs/.logs/inputs-size-current/{one,ten}.{tsx,zbc,cpp,res}, provenance.json. Navigation /tmp/zn-navigation-size/{one,ten}.tsx and /tmp/zn-navigation-one.cpp contains unreachable NavigationProps/Item/SidebarGroup/etc and lambda names. src/ir/opt.cpp removeUnreachable drops dead functions/vtables but intentionally retains all class layouts; removeUnusedData prunes natives/string constants. D268 deferred metadata compaction until needed; investigate reachability/type retention with actual section/code counts before editing. Unused exported classes in artifacts are a lead, not proof they dominate every used-component cost. Choose the smallest measured engine fix.

Preserve live layouts, inheritance/interfaces/instanceof/reflection, generic signatures, native/runtime-created records/Dyn classes, worker registration, callbacks, exceptions, interpreter/AOT/QuickJS and verifier consistency. Hot/debug ABI IDs stay conservative. Do not blindly mark all entries of the untrimmed type table live, nor erase metadata observed by native/typed code. No library/UI source workaround. Proven primary guidance: https://llvm.org/docs/TypeMetadata.html and https://llvm.org/docs/Passes.html (GlobalDCE); these establish visibility/liveness constraints, not a Zinc algorithm. Build one target, exact narrow regression and unchanged gate only; no full suite or benchmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unchanged kit_size passes on combined integrated Inputs/Navigation source, with attributed retained-code/metadata evidence and no budget or UI behavior change
- [ ] #2 A narrow regression protects retained live layouts/type tests/native or Dyn creation and removed unreachable metadata across interpreter AOT QuickJS; hot/debug ABI remains conservative
- [ ] #3 Original kit gallery checks and bounded smoke pass, exact sizes/provenance/limits and proposed milestone tests recorded
<!-- AC:END -->
