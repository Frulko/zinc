---
id: ZN-1085
title: Dispose focus-within subscriptions before node release
status: Backlog
assignee: []
created_date: '2026-11-09 13:53'
updated_date: '2026-11-09 14:06'
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
- [ ] #2 Exact regression proves replacement on a reused live node, self/other unsubscribe during dispatch, double disposal and stale disposer after node release/slot reuse across interpreter AOT QuickJS
- [ ] #3 Public declaration/docs agree; kit workers can clean their subscriptions with existing host.onCleanup without local registry workarounds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented registration-specific idempotent unsubscribe from ui.onFocusWithin, sharing disposeFocusWithin with node release. Existing Registered/Disposed lifecycle and snapshot dispatch remain intact; no new registry, C++/ABI changes or kit caller migration. Dead-node subscription returns a harmless disposer. tools/ui-dts regenerated lib/ui.d.ts; docs/ui.md shows host.onCleanup ownership. Coordinator research: Solid https://docs.solidjs.com/reference/lifecycle/on-cleanup and React https://react.dev/reference/react/useEffect / https://react.dev/learn/synchronizing-with-effects prescribe cleanup when replacing owned subscriptions; existing host.onCleanup and registration object identity are sufficient, with no dependency. Proof: clean read-only engine /Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc, ZINC_ROOT at this worktree; exclusive /tmp/zinc-heavy-run-501.py 60 tests/run --only ui_focus_dispose passed interpreter, explicit --native AOT and QuickJS. Expanded existing fixture proves repeated live-node subscription replacement, double dispose, old disposer after replacement/release/slot reuse, dead-node registration, self/other unsubscribe during snapshot dispatch and deferred new registration. Exclusive 30-second zinc check tests/data/ui_focus_dispose/main.ts passed; generated declaration comparison and git diff --check passed. No build required. usage: n/a. Proposed tests: integrated kit Tooltip/HoverCard and Input rerender smoke after caller migration, ~10 s and under 1 GB; coordinator chooses exact command. No suites, visual, cross-platform or hardware runs.

### Caller integration correction — 2026-11-09

Inputs React MoneyField exposed a missed blur after subscription replacement: focus h, register onFocusWithin(h,f), then focus another node; f must receive false. A new registration currently starts with on=false even if its root is already focused, so after disposing the previous true subscription it misses the leaving transition. Initialize the registration snapshot from current focus without synthesizing an enter callback. Keep exact registration identity/idempotence and add this replacement-while-focused case to the existing T0. Inputs preserved the real failing fixture in .logs/inputs-react-repro/main.tsx frames17–21; no kit workaround. AC2/3 reopened until this caller case passes. The current core worker handles this after its separate ZN-1086 commit.
<!-- SECTION:NOTES:END -->

### Focused replacement correction completed

- Reopened task provenance: only this task file recovered from develop0ecb03575 after separate ZN-1086 commit2b62a0ada. The existing registered/disposed lifecycle, disposer identity, snapshot dispatch and native ABI are unchanged.
- One production assignment initializes the new registration from actual current focus ancestry, including pointer-origin focus. This avoids flushing overlays or invoking callbacks at registration. The next leaving transition reports false; no synthetic enter is emitted.
- Extended existing ui_focus_dispose fixture with already-focused registration after keyboard and pointer focus, no immediate callback, double unsubscribe. The existing registration-during-dispatch case now expects its first false on the following blur, then the normal enter/leave pair. Before the assignment, the fixture fails with all three blur events missing; after, ui_focus_dispose passes interpreter, explicit native AOT and QuickJS.
- Public JSDoc and docs/ui.md now explain initial snapshot/no callback. tools/ui-dts regenerated lib/ui.d.ts with the existing main-tree tsc (no dependency installed), and a second generation compares byte-for-byte. zinc check on the fixture and git diff --check passed.
- Proof compiler: this worker's freshly built build/zinc at2b62a0ada, ZINC_ROOT/default source resolution this tree. All engine checks/runs bounded by shared /tmp/zinc-heavy-run-501.py; no rebuild needed for this library-only change, no process left running. Artifacts .logs/kit-size/{focus-before.log,focus-after.log,focus-check.log,ui-generated.d.ts}. usage: n/a.
- Proposed tests: Inputs worker's existing React MoneyField frames17–21 repro and migrated Tooltip/HoverCard rerender fixture on its own source after integration; ~10 s each, under1 GB. No suites, pixel comparison, benchmark, cross-platform or hardware runs.
