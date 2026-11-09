---
id: ZN-1098
title: Narrow guarded optional callback fields before calls
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 20:56'
updated_date: '2026-11-09 21:06'
labels:
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1016
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1078.12 Data Card. Minimal .worktrees/1078-data-proof/.logs/data-proof/optional-call.ts and optional-call-explicit.ts: props?.onClick !== undefined && props.selected !== undefined ? String(props.selected()) : empty; even explicit props !== undefined && props.onClick !== undefined && props.selected !== undefined guard reports Z0105 null|callback not callable. Existing local tsc --noEmit --strict --lib es2022,dom accepts both minimal files. Fix generic control-flow narrowing rather than caching/casting/restructuring application callbacks. Review narrowing invalidation, access side effects, field optionality and callable member handling. Primary TypeScript research: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html ; https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html . Sole frontend worker, no concurrent checker changes; preserve main external runtime/UI WIP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Guarded optional callable fields narrow through boolean conjunction and conditional branches, including optional-chain and explicit object guards; unchecked and invalidated nullable calls remain errors
- [x] #2 Focused T0 drives valid calls, absent objects/fields, branch/short-circuit side effects, mutation invalidation and negative unsafe calls on all three engines
- [ ] #3 Original Data Card/gallery check and bounded actual behavior proof pass unchanged; docs/changelog/proposed milestone checks and remaining limits are recorded
<!-- AC:END -->

## Implementation and exact proof

The original guards already narrow correctly: plain `props.selected()` checks, but `String(props.selected())` failed. The library conversion first checked the argument, correctly invalidating receiver field paths after that method call, then rechecked the same AST call in its generated template. That second check saw the callback as nullable. The fix keeps the existing `rewritten` node/type mechanism for already-checked Call/New expression holes in library rewrites, including the identity rewrite. It does not restore stale facts, weaken callback typing or cache a new AST clone/generic instance.

- Read TypeScript control-flow guidance (https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-4.html) and functions guidance (https://www.typescriptlang.org/docs/handbook/2/functions.html). Used the existing checker path-symbol/invalidation and snippet providers; no new abstraction or dependency.
- Warm `tools/build zinc` completed with no new check.cpp warning. Original explicit minimal repro now checks unchanged.
- `tests/run --only guarded_callback` PASS interpreter/AOT/QuickJS: optional-chain and explicit object/callback guards, absent objects/fields, false results, side-effecting callbacks that clear themselves, and String/Number/Boolean identity/nonidentity conversions evaluated exactly once. Unchecked calls, calls after an explicit field write and a distinct second call after the first invalidated receiver facts still fail Z0105. Logs `.logs/1098/{build,test}.log`.
- Fresh Data worker is running its original public-barrel Card/gallery checks and short feature proof with this binary. AC3 stays open until those actual-caller proofs return. No Data code workaround is needed.

### Proposed tests

- `tests/run --only guarded_callback`: exact conversion/narrowing regression, seconds after warm AOT cache.
- Data Card/gallery real click/selection and stateful virtual editor proofs in both UI models/all engines; worker-owned short feature proof next, longer keyboard/assistive-technology interaction at owner-chosen milestone.
- Broader generic/library-rewrite combinations remain milestone checks; no suite, performance or memory measurement run.
