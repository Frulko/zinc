---
id: ZN-1110
title: Preserve JSX map rows with trailing call commas
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 01:12'
labels:
  - frontend
  - jsx
  - size-M
milestone: m-32
dependencies: []
ordinal: 1028
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original formatted ZN-1078.17 MonthCalendar: valid .map(callback,) silently stops mounting JSX children while .map(callback) mounts four. Minimal committed original repro .worktrees/1078.17/tests/data/kit_planning/map-trailing.tsx; coordinator copies/logs .logs/blockers/jsx-map-trailing. Frozen clean engine source7774708ca SHA256f561c4cc76172c731e4109cd9161b5a7092ffda9553260f25351a0a1e329fce1. Source path src/frontend/jsx.cpp listAt near726 currently treats every top-level comma as extra argument and returnsJsx/named callback bounds may also include trailing separator. Reuse token/call argument bounds; do not remove commas, alter Prettier settings, rewrite callbacks or copy layout into apps. Planning full source stays normally formatted checkpoint78c13d3ea (all AC open), not integrated until engine fixed. Preserve actual extra-argument diagnostics, one evaluation/order, JSX ownership and canonical Solid/React/custom-helper contracts. Primary research verified coordinator2026-11-10: ECMAScript Arguments grammar allows trailing comma https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#prod-Arguments ; official Prettier trailing-comma option https://prettier.io/docs/options#trailing-commas . Fresh sole core worker next slot; no layout/runtime/UI changes, main external WIP untouched. Exact focused regression/all3 and original formatted Planning proof, no suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Valid trailing call commas preserve mapped JSX rows for direct and nested callbacks, including normally formatted renderSlot block returns and named/imported JSX functions, with no application workaround
- [ ] #2 Focused T0 covers canonical Solid/React and existing helper contracts on interpreter/AOT/QuickJS, equal node counts/content/order with and without comma, once-only evaluation and unchanged actual-extra-argument/invalid-call diagnostics
- [ ] #3 Original formatted Planning MonthCalendar and affected gallery/control callers pass without removing commas or changing formatter, with docs/changelog/provenance/limits and proposed tests recorded
<!-- AC:END -->
