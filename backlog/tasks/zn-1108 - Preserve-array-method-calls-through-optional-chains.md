---
id: ZN-1108
title: Preserve array method calls through optional chains
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 23:32'
labels:
  - frontend
  - ir
  - size-M
milestone: m-32
dependencies: []
ordinal: 1026
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1078.14 TimelineEditor. Minimal valid TypeScript: interface Key{id:string}; interface Track{keys:Key[]}; function track():Track|undefined{return {keys:[{id:"a"}]}}; const value:Key|undefined=track()?.keys.find((item:Key)=>item.id==="a");. Clean engine da7ca0360 SHA25685f6d02a26948c1755090b0c06b3a926cad5cefa6df1799ce01d737a13e28f68 rejects find with Z0106 on Key[], while identical nonoptional track().keys.find passes. Baseline sources/logs .logs/blockers/optional-array-method and active panels worker .logs. Keep original app code, fix generic optional-chain call/HOF lowering rather than adding guards or duplicating per-method special cases. Existing check.cpp chainNull/chainStop/continueChain near77 and array HOF dispatch are leads, not a prescribed patch. Need preserve single receiver/key evaluation, skipped callbacks/arguments when base absent, normal nullable intermediate errors, and original three-engine behavior. No runtime/ui.ts/allocator/LVGL changes; those carry external WIP. Primary research verified by coordinator 2026-11-10: TypeScript3.7 Optional Chaining https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html and ECMAScript OptionalExpression/ChainEvaluation https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-optional-chaining. Confirm strict tsc, inspect existing providers/callers, use existing chain flags and HOF lowering. Next fresh core slot; only one core writer. No suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Original optional object-to-array method chain checks and runs unchanged, with the public result type preserved and existing nonoptional dispatch reused
- [ ] #2 Focused T0 proves present/absent, single evaluation, argument/callback short-circuit, relevant array HOF returns and invalid nullable-intermediate negatives on interpreter/AOT/QuickJS
- [ ] #3 Original Tool panels Timeline/Curve callers pass without guards or frame/type workarounds; docs/changelog, provenance, limits and proposed tests recorded
<!-- AC:END -->
