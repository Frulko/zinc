---
id: ZN-1116
title: Lower captured recursive local functions without invalid IR
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 03:18'
labels:
  - compiler
  - ui
  - size-M
milestone: m-32
dependencies: []
ordinal: 1249
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Original Music library state checks but interpreter/AOT fail IR verification after reference counting with const of a non-scalar type in local poll closure. Minimal10lines .logs/blockers/recursive-local-function/recursive-small.ts: make() captures generation in nested function poll, nested setTimeout arrow reads token/generation and references poll recursively; merely constructing returned {poll} fails, never invoking it. QuickJS original Music runs. Root Music worker also has larger signal/forward-local-function reproduction and original examples/ui/music/src/state.ts. Preserve natural code, fix shared frontend/IR capture lowering/RC once across engines. Test captured recursive local function construction and one bounded callback/restart/disposal where relevant, scalar closure controls/forward mutual callable only as implicated. No caller rewrite/top-level extraction. Protected src/rt/runtime/HAL/lib/std/ui.ts external WIP untouched. Primary lookup ECMAScript function declarations/captured lexical environment https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-functiondeclarations; Sonnet unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Natural captured recursive local declarations and nested callbacks lower valid IR and run with correct capture semantics/evaluation across interpreter AOT and QuickJS; small exact T0 regression
- [ ] #2 Original unchanged Music state and short muted playback/UI proof pass on all three engines without app rewrite
<!-- AC:END -->
