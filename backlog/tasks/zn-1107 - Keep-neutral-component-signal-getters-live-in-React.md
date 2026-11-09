---
id: ZN-1107
title: Keep neutral component signal getters live in React
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 23:09'
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
- [ ] #1 componentSignal getters observe the last setter value immediately and across multiple frame-batched actions in both Solid and React, while raw React useState snapshot/scheduling semantics remain unchanged
- [ ] #2 Exact regression proves same-callback and separate same-frame updates, functional control navigation, rerenders, isolation, cleanup/stale setter and parent/child ownership in both models across all three engines
- [ ] #3 Original Code JSON folding and inline link keyboard sequences pass without artificial frame delays or per-control state mirrors; affected Data input/PathBar and other canonical consumers remain coherent
- [ ] #4 Remove only per-control mirror refs used solely to compensate for this bridge snapshot gap, retaining actual transaction/resource/lifetime ownership; document contract and proposed milestone tests
<!-- AC:END -->

Primary semantics: https://react.dev/learn/state-as-a-snapshot ; https://react.dev/reference/react/useRef ; https://docs.solidjs.com/reference/basic-reactivity/create-signal . Preserve raw useState snapshots; this task fixes the neutral getter/direct-setter bridge contract.
