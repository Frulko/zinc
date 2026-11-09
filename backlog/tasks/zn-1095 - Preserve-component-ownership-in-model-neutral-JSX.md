---
id: ZN-1095
title: Preserve component ownership in model-neutral JSX
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 18:11'
updated_date: '2026-11-09 18:29'
labels:
  - ui
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1013
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ordinary conditional CalendarMonth in ZN-1078.07 and stateful virtual cells/editors in ZN-1078.12. Picker sub-agent reproduced exact compiler wiring in `.worktrees/1078-pickers/.logs/picker-host-ownership/`: bounded static check passes; lowered.log line8 gives the outer React component `_rc`, while line40 lowers a model-neutral library's ordinary conditional Stateful JSX to `_show(... _append(... Stateful({})) ...)` with no child `_rc`. Host._show/_comp call the child inline under React. Thus the hooks are attributed to the parent, and virtual rows build with React current owner null. Runtime cleanup/state assertions are prepared but unrun because another session holds the app queue. This is a source wiring finding, not a claimed runtime test result.

Primary research by Picker sub-agent: https://react.dev/reference/rules/react-calls-components-and-hooks (the reconciler owns component identity; direct conditional calls break hooks), https://react.dev/learn/preserving-and-resetting-state (removed child state is discarded), https://react.dev/reference/react/useEffect (cleanup on removal/dependency change).

Fix the shared neutral JSX/helper boundary with component identity/key and existing React instance ownership. Preserve Solid's tracked versus untracked behavior and cleanup, normal JSX source, and both kit/Nuxt host consumers. No always-hidden second calendar, hand-managed conditional hook array, component registry or widget-specific compiler patch. Coordinate canonical kit/host ownership with the coordinator: Picker checkpoint2476e9887 contains separate new helpers; avoid importing unrelated unverified UI source. Keep library layer direction and arbitrary custom JSX helper compatibility explicit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Normal nested and conditional model-neutral JSX components have distinct React identities, keys, persistent state while mounted and fresh state after removal/remount; Solid behavior remains coherent on all engines
- [x] #2 Exact regression proves effect cleanup exactly once on removal, sibling state isolation, keyed reorder and stateful virtual row creation/disposal without owner-null hooks or stale handles
- [ ] #3 Ordinary Picker one/two-month toggle and Data stateful virtual editor/custom-cell proof pass without UI workarounds; proposed milestone checks and actual limits are recorded
<!-- AC:END -->

## Implementation and bounded proof — 2026-11-09

- Canonical `zinc:ui/kit/host` and `zinc:ui/nuxt/host` JSX helper specifiers opt into named/keyed component lowering. All tracked kit/Nuxt family pragmas migrate together, and the resolver recognizes Nuxt's helper module. Static Solid props remain untracked and dynamic props tracked. Arbitrary custom helper modules retain their existing `_comp(parent, make)` contract; no path heuristic, application option, widget registry or hidden UI children.
- React neutral Show/For receive logical component owners so removing the first of two same-type siblings does not transfer its hooks to the second. Child instance host rebinding updates its serial, preserving keyed reorder. Saved current owner and child-update scopes restore with finally, including render errors; failed new children are logically unmounted before rethrow.
- React virtual rendering retains mounted row instances for equal count/height, updates their render closure and reattaches their existing hosts. Count/height changes rebuild visible rows as before. Each render record has Mounted/Closed phases and one checked transition, a list serial, and a map bounded to mounted rows. Parent removal closes rows. A stale row still releases its logical instance/hooks/subscriptions, but generation mismatch suppresses destruction of the replacement UI occupant.
- Warm zinc build PASS. First exact neutral_ownership fixture PASS for Solid and React on interpreter/AOT/QuickJS: nested hooks, first-sibling conditional removal/remount, keyed reorder, scroll cleanup, stale setter, and typing in a focused virtual row while its parent renders. Expanded fixtures add canonical Nuxt, unchanged custom-helper ABI, same-type branch state and stale-host/throw recovery; final expanded rerun pending.
- Existing exact `kit_inputs` and `kit_overlays` PASS (including React overlay focus/cleanup consumers). No suite, T1/T2/demo, benchmark, cross build or runtime speed measurement. Original Picker/Data feature AC remains open pending fresh coordinated caller proofs.

### Proposed decision (coordinator assigns any number)

The component identity ABI is opt-in through the two canonical standard helper module identities. This makes library lowering model-neutral while preserving third-party custom helper source compatibility. Logical branch/list owners carry lifecycle only and create no hidden widgets.

### Proposed tests and limits

- Owner-chosen milestone: fast refresh, broader React/Solid reconciliation, virtual scrolling/parent-removal and exception/RC checks. Count/height changes still rebuild rows; arbitrary imperative destruction of a UI node is not an application reconciliation API. Generation checks prevent stale row cleanup from mutating a reused node while releasing the old logical owner.

### Expanded exact proof

`tests/t0/neutral_ownership.sh` PASS with own warm binary: both models/all three engines, canonical Nuxt nested component, legacy custom helper check, plus React all-three stale-host replacement/parent close, all old row effect subscriptions released, stale setter never rerenders, render throw/restart restores parent hooks and child updates, same-type/same-position branch state preserved. Exact existing `kit_inputs`/`kit_overlays` PASS. Original gallery `check examples/ui/kit-gallery` and bounded headless three-frame interpreter smoke PASS. Logs `.logs/core-proof/`. AC1/2 checked; task parked Backlog only for AC3 original Picker/Data coordinated proofs, not marked Done. No own process remains.

### Coordinated helpers and lifecycle review fixup

- Transferred the coordinator-authorized canonical Picker host additions: `_scroll`, `componentSignal`, `componentMemo`, optional React dependency array on `componentEffect`; Nuxt forwards `_scroll`. Exact fixture now uses the real canonical state helper and checks memo updates, dependency-controlled effects and cleanup under both models/all three engines.
- Read-only review found stale row reuse on a retained-list parent render could still insert a replacement occupant. `ui.invalidateVirtualRow` checks the old serial, forgets that stale UI row index without releasing the new occupant, and requests fresh layout; React drops the old logical row before any insert. Regression keeps the list mounted and rerenders before closing, checks replacement parent/serial, row subscriptions and stale setter.
- Imperative toast JSX creates parentless React owners. New generic `ui.onDestroy` notification releases parentless React `_rc`/`_cc` owners when their host is destroyed. Stored node generations skip physically removed/reused nodes while permitting cleanup of nodes created by an interrupted render. Hook/instance cleanup no longer depends on a declarative parent existing. Existing UI release lifetime owns the callback; callback is cleared before invocation and freed-node slot return uses finally. Repeated real toast/clear followed by app-root destruction asserts `_active() === false`, so neither imperative nor stale row owners remain rooted.
- Expanded exact `neutral_ownership` PASS on all three engines, including both models, stale row kept-list rerender, toast disposal and throw/restart. Logs `.logs/core-proof/neutral_ownership-{helpers,stale,dispose}.log`. No C++ edits/build required for these standard-library changes; own warm binary compiles each current source.

### Reentrant release proof

Coordinator review found a child destroy callback could reenter parent release. UI nodes now use one Alive/Releasing/Released phase and transition before callbacks; alive is derived. Child release snapshots generations so a recycled sibling is untouched, destroy notification is cleared once, and slot return uses finally. React instances similarly use Mounted/Unmounting/Unmounted; cleanup begins its transition before user code, runs remaining owned cleanup even after an error, and clears roots in finally. Scheduled updates ignore unmounting instances. Stored host generations protect old and newly created render nodes; an owner removed inside cleanup cannot resume committing into a reused host. Unrelated scheduling/lifecycle flags are unchanged.

Expanded `neutral_ownership` PASS again on interpreter/AOT/QuickJS: child destroys parent and allocates a survivor, throwing notification returns its free slot once, reentrant component cleanup runs once, interrupted render leaves no `gone` node, survivor content/serial is preserved, owner count returns to zero. Existing state/memo/deps and virtual/focus/sibling cases still pass. Log `.logs/core-proof/neutral_ownership-final.log`.
