---
id: ZN-1085
title: Dispose focus-within subscriptions before node release
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 13:53'
updated_date: '2026-11-09 13:56'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1006
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks repeated React rendering of kit Tooltip and HoverCard (ZN-1078.10), and touched Inputs focus handlers. ui.onFocusWithin currently stores each callback until its node is released; a React parent reuses its host node across renders, so replacement component closures cannot unregister their callbacks via existing host.onCleanup. Minimal repro: repeatedly register focus callback on the same live node, dispose previous component closure, then move focus; previous callbacks still run. Preserve ZN-1081 snapshot/identity safety.

Return an idempotent disposer from onFocusWithin, reusing its explicit Registered/Disposed lifecycle and exact registration identity. Old callers ignoring the result keep working. Disposal must be safe during callback snapshot dispatch, after node release/slot reuse, and when called twice; never remove a replacement registration. Update public declarations, docs and exact regression. Do not edit kit input/overlays (active workers own callers); they migrate on integration. No C++/ABI change or new callback registry.

Primary research: Solid onCleanup https://docs.solidjs.com/reference/lifecycle/on-cleanup and React useEffect https://react.dev/reference/react/useEffect require cleanup for owned subscriptions and before effect replacement. Existing Zinc ui_focus_dispose and host.onCleanup supply the mechanism; no new library needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 onFocusWithin returns an idempotent registration-specific disposer while existing callers ignoring it remain compatible
- [x] #2 Exact regression proves replacement on a reused live node, self/other unsubscribe during dispatch, double disposal and stale disposer after node release/slot reuse across interpreter AOT QuickJS
- [x] #3 Public declaration/docs agree; kit workers can clean their subscriptions with existing host.onCleanup without local registry workarounds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented registration-specific idempotent unsubscribe from ui.onFocusWithin, sharing disposeFocusWithin with node release. Existing Registered/Disposed lifecycle and snapshot dispatch remain intact; no new registry, C++/ABI changes or kit caller migration. Dead-node subscription returns a harmless disposer. tools/ui-dts regenerated lib/ui.d.ts; docs/ui.md shows host.onCleanup ownership. Coordinator research: Solid https://docs.solidjs.com/reference/lifecycle/on-cleanup and React https://react.dev/reference/react/useEffect / https://react.dev/learn/synchronizing-with-effects prescribe cleanup when replacing owned subscriptions; existing host.onCleanup and registration object identity are sufficient, with no dependency. Proof: clean read-only engine /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc, ZINC_ROOT at this worktree; exclusive /tmp/zinc-heavy-run-501.py 60 tests/run --only ui_focus_dispose passed interpreter, explicit --native AOT and QuickJS. Expanded existing fixture proves repeated live-node subscription replacement, double dispose, old disposer after replacement/release/slot reuse, dead-node registration, self/other unsubscribe during snapshot dispatch and deferred new registration. Exclusive 30-second zinc check tests/data/ui_focus_dispose/main.ts passed; generated declaration comparison and git diff --check passed. No build required. usage: n/a. Proposed tests: integrated kit Tooltip/HoverCard and Input rerender smoke after caller migration, ~10 s and under 1 GB; coordinator chooses exact command. No suites, visual, cross-platform or hardware runs.
<!-- SECTION:NOTES:END -->
