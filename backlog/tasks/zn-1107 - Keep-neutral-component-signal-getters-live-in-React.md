---
id: ZN-1107
title: Keep neutral component signal getters live in React
status: Done
assignee: []
created_date: '2026-11-09 23:09'
updated_date: '2026-11-09 23:27'
labels:
  - ui
  - reactivity
  - size-M
milestone: m-32
dependencies: []
ordinal: 1025
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.13 actual JsonViewer and inline-link React keyboard proof. Canonical host componentSignal currently returns React [()=>capturedUseStateValue,setValue], while Solid getter reads latest state. Two real ui.sendKey events in one frame (Down thenLeft) operate on prior selected row and fold the wrong JSON node; Home/Enter/Right/Space links have same hazard. Getter/direct-setter API should preserve neutral Solid-style live reads, not require render delays or duplicate refs in each control. Root selected stable React useRef mirror, getter reads current, setter updates it before existing setValue scheduling; raw useState snapshots stay unchanged. Inspect generation/unmount/hooks/context semantics and avoid restoring stale refs into other owners. Code worker has real/minimal repro and source. Core1105 current fresh batch gets this as THIRD task, prioritized1105→1107→1106 after stopping only its own1106 build cleanly. No shared-core writer except /root/text_hit_1105. Review Data editOwner/draft mirrors introduced for same timing issue and migrate only redundant compensation. Main protected UI sparseFenwick42/19 and runtime/main/LVGL changes must stay untouched. Primary React refs/state-snapshot and Solid createSignal docs already inspected by core worker; retain links in notes. No suites, exact T0 and actual original Code/Data caller proof, no source/API workaround.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 componentSignal getters observe the last setter value immediately and across multiple frame-batched actions in both Solid and React, while raw React useState snapshot/scheduling semantics remain unchanged
- [x] #2 Exact regression proves same-callback and separate same-frame updates, functional control navigation, rerenders, isolation, cleanup/stale setter and parent/child ownership in both models across all three engines
- [x] #3 Original Code JSON folding and inline link keyboard sequences pass without artificial frame delays or per-control state mirrors; affected Data input/PathBar and other canonical consumers remain coherent
- [x] #4 Remove only per-control mirror refs used solely to compensate for this bridge snapshot gap, retaining actual transaction/resource/lifetime ownership; document contract and proposed milestone tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Existing provider `componentSignal` now keeps its React value in the existing stable `useRef` hook. Its getter reads `current`, and its direct setter updates `current` before calling the existing React state setter. Raw `react.useState`, scheduling, reconciliation, generation and unmount paths are unchanged. No per-control state mirror or delayed-event workaround was added.
- Primary references: [React useRef](https://react.dev/reference/react/useRef) describes stable ref identity across renders and mutable current values; [React state snapshots](https://react.dev/learn/state-as-a-snapshot) describes the separate raw state/callback contract; [Solid createSignal](https://docs.solidjs.com/reference/basic-reactivity/create-signal) supplies the getter/direct-setter shape. This is Zinc's internal neutral getter contract, not advice to mutate ordinary React render state.
- Caller audit: DataGrid `editOwner` and PathBar `draftOwner` duplicated their signal payload solely for same-event freshness. Removed both mirror refs/wrapper setters; reads use `edit()` / `draft()`. TreeTable's duplicate revision counter now increments its live signal. Kept GridEdit state transitions, selection anchors, tree branch generations and cleanup, file request/session/history refs, and picker gesture/calendar/hue/catalog ownership.
- `tests/run --only component_signal` first failed on the baseline with `two same-event updates read live`; final candidate passes Solid/React × interpreter/AOT/QuickJS. It proves two setter calls in one callback, separate real clicks before a render, retained getters after rerender, i32/string generic values, parent/sibling/following hook isolation, one coalesced React render per event, raw React snapshots `0,0,1`, owner cleanup and stale setters after node reuse. A following render verifies UI scheduling, not a delay used to make an event work.
- Original `tests/run --only kit_data` passes all 12 programs (four original fixtures × three engines). React tests include input→Enter/Escape/reentrant blur in the same frame and PathBar input→Enter, after the duplicate mirror removal. No fixture/control workaround. Engine frozen SHA256 `8637544164c92f8d5d9e5ca8691c59b98faeb5d2eda2aaa9b2d657390c18088b`, source root this worktree. `zinc check tests/data/component_signal/body.tsx` passes.
- Final host source SHA256 `7ea69c699df3857d7276c41ba97a22d60115eef63c3eef30d7f80eec0c8d53c4`, Data source `4259e57bb7973c3dd18a0dcb6b1036a168a77f25d6322d581f5f50d2ebe652e9`, exact fixture `4401e5bbcb61527b74126f4dc69e783804e720872c0df632be59a415c9ee0af9`. No engine build needed; no owned process left.
- Original React Code fixture now reports `inline links: ok` through wrapped pointer links, Home/Enter/Right/Space, drag and background cancellation with this host. The later JSON count-change 5→4 observation was before normal paint: `ui.mount` runs its extra callback before `ui.frame`, which populates fixed virtual rows. A direct `_virtual` 5→4 repro passed. Code assertions now use existing `ui.setAfterPaint` on the first normal paint, with no component workaround, extra UI frame or `_virtual` source change. Final original `kit_code` exact T0 passes all six model/engine combinations, including JSON fold/isolation/ARIA, links, editor find/go-to/remount, and diff fold/navigation. Logs and provenance in Code worker `.logs/kit-code/t0.log`, `t0-summary.log`, `candidates-provenance.txt`; final core candidates are text source `ebb806...`, declarations `6e4a54...`, this host `7ea69c...`, frozen retained engine `b432c382c97d9f45dce9f7b0400914812904854aabaed2b23aec2912b12a1ff9`. Overlays restored; all four acceptance criteria proven.

## Proposed tests

- Quiet-machine long-lived Data/tree/file/virtual-row churn and physical keyboard/touch/VoiceOver tests at an owner-selected milestone; no suite, pixels, benchmark or broad lifecycle suite was run.

Coordinator decision D276 records the neutral live-getter contract and preserved raw React snapshots.
<!-- SECTION:NOTES:END -->

Primary semantics: https://react.dev/learn/state-as-a-snapshot ; https://react.dev/reference/react/useRef ; https://docs.solidjs.com/reference/basic-reactivity/create-signal . Preserve raw useState snapshots; this task fixes the neutral getter/direct-setter bridge contract.
