---
id: ZN-1098
title: Narrow guarded optional callback fields before calls
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 20:56'
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
- [ ] #1 Guarded optional callable fields narrow through boolean conjunction and conditional branches, including optional-chain and explicit object guards; unchecked and invalidated nullable calls remain errors
- [ ] #2 Focused T0 drives valid calls, absent objects/fields, branch/short-circuit side effects, mutation invalidation and negative unsafe calls on all three engines
- [ ] #3 Original Data Card/gallery check and bounded actual behavior proof pass unchanged; docs/changelog/proposed milestone checks and remaining limits are recorded
<!-- AC:END -->
