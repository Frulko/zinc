---
id: ZN-1083
title: Preserve complete mapped children in JSX Show
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 12:34'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1072
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks RadioCards in examples/ui/kit-gallery (ZN-1078.08). Valid JSX mapped children directly inside Show are rejected as i32[] to i32, while the same map inside View checks. Selection reduced it to <Show when={true}>{rows.map((row: Choice[]) => <View>{row.map((value: Choice) => <Text>{value.label}</Text>)}</View>)}</Show>, with kit host pragma. Original component remains unchanged; reproducer in Selection worktree .tmp-selection-nested/main.tsx.

Root lead: src/frontend/jsx.cpp special Show around1516-1520 emits a body from childNode(kids[0]), assuming a single node and apparently dropping later children. Reuse the existing complete child/fragment emitter instead of coercing arrays or wrapping user code. Preserve when/fallback, numeric-array text behavior, reactivity, cleanup and existing single-node paths. No runtime gesture/native changes requested.

Research delegated before task: Solid Show https://docs.solidjs.com/reference/components/show and JSX.Element may be arrays https://docs.solidjs.com/configuration/typescript ; TypeScript children property https://www.typescriptlang.org/docs/handbook/jsx.html ; React expressions https://react.dev/learn/javascript-in-jsx-with-curly-braces and fragments https://react.dev/reference/react/Fragment . All support retaining the full child body/collection. Use existing Zinc child semantics for numeric arrays, not node-handle guessing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mapped JSX node children and multiple direct children inside Show check and render on Solid/React across interpreter, AOT and QuickJS
- [ ] #2 A narrow T0 covers conditional toggles and fallback without stale or duplicate children, preserving ordinary numeric-array text and single-node behavior
- [ ] #3 The original Selection RadioCards component checks and runs with its direct Show map unchanged
<!-- AC:END -->
