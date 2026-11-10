---
id: ZN-1108
title: Preserve array method calls through optional chains
status: Done
assignee: []
created_date: '2026-11-09 23:32'
updated_date: '2026-11-10 00:24'
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
- [x] #1 Original optional object-to-array method chain checks and runs unchanged, with the public result type preserved and existing nonoptional dispatch reused
- [x] #2 Focused T0 proves present/absent, single evaluation, argument/callback short-circuit, relevant array HOF returns and invalid nullable-intermediate negatives on interpreter/AOT/QuickJS
- [x] #3 Original Tool panels Timeline/Curve callers pass without guards or frame/type workarounds; docs/changelog, provenance, limits and proposed tests recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the existing collection helper dispatch over the nonnullable receiver type, retaining the receiver guard through a compiler-only AST flag when a method becomes a helper call. Lowering reuses optionalAccess: receiver once, later arguments/callbacks only in the present branch, null result otherwise; continuation metadata retains ordinary nullable-intermediate errors. Array HOFs, generated array/Map/Set iterators and Map/Set forEach share this path. Native methods stay native. The touched receiver override/recursion guard now restores through a scoped RAII guard, including nested overrides. No new runtime API, dependency, user-code wrapper or control workaround.

Primary semantics: TypeScript3.7 Optional Chaining https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html and ECMAScript ChainEvaluation https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-optional-chaining. The unchanged five-line original passes strict tsc (standard ES2022 libs; Zinc prelude has an unrelated global value decorator, so its global name collision is excluded from this pure TS oracle). Exact optional_collection passes interpreter/native AOT/QuickJS with original repro, present/absent, once-only receivers, skipped callback factories/arguments, nested map/filter continuation, flatMap/reduce/some/every/forEach, native string-array join, array values/entries, Map/Set generated iterators, callback throws and nullable/grouped-chain negatives. Memory check allocs=frees/leaked0. Build retains existing dependency warnings outside changed sources; changed checker/lowering rebuild emitted none.

Caller checkpoint: panels worker ran unchanged original kit-gallery check with candidate SHA2567316bee69a330eb5fb0a921bc342951b59950b734b84c4f24ab406935c7d2e26 and its own source root:27files checked, no errors; track()?.keys.find and track()?.clips.find remain unchanged. AC3 stays open until original runtime caller proof after separate1109 method-default receiver correction. Next command after1109: run original Tool gallery/model with candidate on all3; coordinator closes AC3 on that evidence. Source/binary fingerprints and raw logs in .logs/1108/provenance.json, final.log, mem.json; caller log panels/.logs/check-1108.log. Proposed tests: long callback/collection churn and device typed-engine replay at owner-selected milestone, minutes/memory unmeasured; no suite/benchmark/pixels/device run started.

Original Tool14 full UI passes30/30 routes (five families ×Solid/React ×interpreter/native AOT/QuickJS) with1109 candidate b96e6cb7 and unchanged optional method chains. Actual models also pass all3. No guards, delayed events or production rewrites; raw .worktrees/1078-panels/.logs/proof-all-1109.log plus per-route logs. AC3 now proven after shared1109 correction. Coordinator will rebuild/replay the final integrated engine with the shared size correction.

Root final engine7774708ca/f561c4cc replay optional_collection PASS after integration with1109 and circle serialization; exact logs combined-optional_collection.log and final provenance kit-integration-2026-11-10.json.
<!-- SECTION:NOTES:END -->
