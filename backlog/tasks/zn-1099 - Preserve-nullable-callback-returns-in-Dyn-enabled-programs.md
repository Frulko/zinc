---
id: ZN-1099
title: Preserve nullable callback returns in Dyn-enabled programs
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 20:57'
updated_date: '2026-11-09 21:10'
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
- [x] #1 Null/undefined callback returns remain assignable to existing optional cleanup signatures in Dyn-enabled graphs; callable values keep identity, invocation and cleanup semantics
- [x] #2 Exact T0 covers Dyn-triggering unused and used imports, scalar and real cleanup returns, branch/side effects, invalid conversion negatives and safe lifetime across all three engines
- [x] #3 Original Picker componentEffect source and gallery check/short runtime proof pass without source workaround; documentation/changelog/limits and proposed tests are recorded
<!-- AC:END -->

## Implementation and exact proof

Need → provider → gap: D18 already stores typed nullish results as a flagged null reference, but with Dyn enabled an `undefined` identifier was unconditionally rewritten to the Dyn singleton before its typed expected context was considered. The six-line correction preserves typed nullish literals in an existing nullable expected slot. Other contexts retain the existing Dyn undefined. No callable boxing, arbitrary Dyn-to-function conversion, kit special case, ABI change or new dependency. Typed cleanup identity/lifetime remains the existing closure provider's responsibility.

- Verified primary TypeScript function/nullability guidance (https://www.typescriptlang.org/docs/handbook/2/functions.html#function-type-expressions and https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#null-and-undefined). The owner-required actual original `effect-repro.ts` now checks unchanged.
- Warm `tools/build zinc` completed without a new warning. Exact `tests/run --only nullable_cleanup` PASS interpreter/AOT/QuickJS with both unused and used Dyn-triggering imports: explicit and implicit undefined, typed optional variable initialization, real cleanup identity/invocation, conditional branches, repeated retained cleanups and once-only callback counts. Opaque Dyn-to-typed-callable and scalar cleanup returns remain rejected. Logs `.logs/1099/{check,test}.log`; the final combined build log is `.logs/1097/build.log`.
- Assertion API note: `zinc:assert.equal` accepts unknown and would itself box a function into Dyn (deliberately unsupported). The regression compares typed function/nullish identity as a boolean assertion instead; this changes no application code or callable boundary.
- Fresh Picker worker's original public-barrel gallery and Solid/React fixtures check unchanged. Exact kit_pickers interpreter/QuickJS and explicit native full Solid/React fixtures PASS; Wheel/Ruler initial selection and both scroll axes plus hidden TimePicker wheels PASS all3. No cleanup-return, manifest, import or delayed-frame workaround. Logs `.worktrees/1078-pickers-proof/.logs/pickers-proof/`. AC3 is an actual caller proof, not a parser-only claim.
- Main's protected runtime/Fenwick/host changes were not edited. Separate baseline nullable-string Map/Set key defect is retained in1097 notes and routed to the coordinator's next fresh core task1100, outside this five-task batch.
- Batch usage: usage n/a (tools/usage). No own live or queued build/app/test remains after proof.

### Proposed tests

- `tests/run --only nullable_cleanup`: exact contextual-nullish/typed-cleanup regression, seconds after warm AOT cache.
- Long mount/unmount/throw/restart cleanup and heap observation in ordinary UI apps, plus reduced-profile/cross-platform proofs, at owner-chosen milestone; no suite, benchmark or memory measurement run here.
