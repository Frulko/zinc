---
id: ZN-1097
title: Infer collection constructor types from iterable arguments
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 20:56'
labels:
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1015
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1078.07 picker fixture. Minimal .worktrees/1078-pickers-proof/.logs/pickers-proof/set-repro.ts: const groups=['faces','people']; const unique=new Set(groups); console.log(unique.size); current checker emits Z0109. lib/zinc.d.ts228 promises generic Iterable constructor; check.cpp1950-1959 rejects before inspecting arguments unless explicit or expected type exists. D175 adds expected-type inference, not a prohibition on argument inference. Do not annotate app code to hide engine gap. Reuse collection generic inference across Set/Map, preserve expected/explicit constraints and errors. Primary research: https://www.typescriptlang.org/docs/handbook/2/functions.html#inference ; https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7#instantiation-expressions . Existing core1093 correction0ae64e937 is integrated. Sole core worker after1096; preserve other-session main WIP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Set and Map constructor iterable arguments infer existing generic types consistently with explicit and expected types; incompatible inputs remain clear errors
- [ ] #2 Focused T0 covers arrays and existing iterable forms, empty/annotated/expected cases, unions and invalid inputs across interpreter, AOT and QuickJS
- [ ] #3 Original Picker fixture checks and bounded feature proof pass without explicit-generic workaround; docs/changelog/limits and proposed tests are recorded
<!-- AC:END -->
