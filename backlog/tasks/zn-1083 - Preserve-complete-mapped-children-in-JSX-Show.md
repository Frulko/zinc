---
id: ZN-1083
title: Preserve complete mapped children in JSX Show
status: Done
assignee: []
created_date: '2026-11-09 12:34'
updated_date: '2026-11-09 12:52'
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
- [x] #1 Mapped JSX node children and multiple direct children inside Show check and render on Solid/React across interpreter, AOT and QuickJS
- [x] #2 A narrow T0 covers conditional toggles and fallback without stale or duplicate children, preserving ordinary numeric-array text and single-node behavior
- [x] #3 The original Selection RadioCards component checks and runs with its direct Show map unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- The shared JSX component child-body emitter keeps the existing direct-node path and delegates all other bodies to the existing fragment/children lowering. Show uses that same emitter instead of assuming its first child is one node. No runtime, kit, native, gesture or Selection source changes.
- Preserve the existing `!react` Show boundary: Solid exports the Show marker; React consumes Show through existing kit-host components. An application's own React Show component remains an ordinary component. No new React API or node-handle guessing.
- Research supplied by the coordinator: [Solid Show](https://docs.solidjs.com/reference/components/show) conditionally renders its child body and fallback; [Solid JSX.Element](https://docs.solidjs.com/configuration/typescript) includes arrays; [TypeScript JSX children](https://www.typescriptlang.org/docs/handbook/jsx.html), [React expressions](https://react.dev/learn/javascript-in-jsx-with-curly-braces) and [React fragments](https://react.dev/reference/react/Fragment) support complete child collections. Existing Zinc fragment lowering is sufficient; no library or new representation is needed.
- Proof: old baseline `c1c330cfa` rejects the regression fixture with Z0103 for JSX-node arrays and ordinary numeric arrays passed as Show's node. New engine checks both Solid/React consumer fixtures and passes `tests/run --only jsx_show` (interpreter and QuickJS); explicit `zinc build --native` and eight-frame native runs pass the identical assertions for each model. The committed T0 includes those same native commands. Live-tree assertions cover nested mapped nodes, multiple siblings, a single node, an empty Show, numeric maps/arrays as text, fallback, two hide/show cycles and list replacement. Solid cleanup count is exactly five after its removed rows; both consumers assert complete tree contents after every change.
- Built only `tools/build zinc`. The final incremental build has no warnings; fresh-build warnings in existing SDK/other source remain outside this frontend change. Native proof builds took 4.3 s (Solid) and 3.4 s (React), each 5.3 MB, indicative while workers were present; these are build diagnostics, not performance claims. RSS was not measured. Runs were bounded/headless and left no process.
- AC3 verified by Selection in its own worktree with this worker binary and `ZINC_ROOT=$PWD`: `zinc check examples/ui/kit-gallery` exit 0 (0.147 s); `.tmp-selection-show/main.tsx` imports the original unchanged gallery SelectionSection, including RadioCards with its direct Show map. Headless two-frame interpreter and QuickJS runs exit 0 (about 0.25/0.42 s), explicit native AOT build/run exit 0 (about 6.7 s). No wrapper around Show, no Selection source workaround; RSS unmeasured.
- Decisions/later/numbers for coordinator: reuse the existing complete fragment emitter; preserve the supported Show API boundary. No new dependency, decision number, later line or performance measurement.
- Usage: n/a.

**Proposed tests**
- `ZINC=<integrated>/build/zinc tests/run --only jsx_show`: repeat the focused six-engine/consumer cases after integration, about 15 s, RSS unmeasured.
- `ZINC=<integrated>/build/zinc tests/run --only jsx_map_local` and `--only solid_cleanup`: existing child-provenance and owner cleanup regressions at the owner's next selected validation, seconds, RSS unmeasured; not run in this worker.
<!-- SECTION:NOTES:END -->
