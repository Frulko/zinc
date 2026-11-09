---
id: ZN-1099
title: Preserve nullable callback returns in Dyn-enabled programs
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 20:57'
labels:
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1017
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1078.07 gallery componentEffect returns at pickers.tsx152/257/352. Minimal .worktrees/1078-pickers-proof/.logs/pickers-proof/effect-repro.ts: const dynamic:any=1; function effect(callback:()=> (()=>void)|undefined):void{callback();} effect(()=>{console.log(dynamic);return undefined;}); Zinc emits Z0005 converting Dyn to null|()=>void. Existing tsc strict accepts; same callback without Dyn trigger passes Zinc. Actual picker source has no any, but normal barrel reaches existing app-chrome JSON/any declarations, exposing legitimate program-wide Dyn lowering. check.cpp1553 rejects !dynConvertible(null|Func). Preserve cleanup callback/nullish ABI without special-casing kits, changing application returns or removing normal imports. Review generated/prelude conversions and typed callable safety on all engines. Primary references: https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions ; https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined . Sole core worker; fifth and final task of1093/1096/1097/1098/1099 batch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Null/undefined callback returns remain assignable to existing optional cleanup signatures in Dyn-enabled graphs; callable values keep identity, invocation and cleanup semantics
- [ ] #2 Exact T0 covers Dyn-triggering unused and used imports, scalar and real cleanup returns, branch/side effects, invalid conversion negatives and safe lifetime across all three engines
- [ ] #3 Original Picker componentEffect source and gallery check/short runtime proof pass without source workaround; documentation/changelog/limits and proposed tests are recorded
<!-- AC:END -->
