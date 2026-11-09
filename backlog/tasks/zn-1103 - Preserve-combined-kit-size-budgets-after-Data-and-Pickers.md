---
id: ZN-1103
title: Preserve combined kit size budgets after Data and Pickers
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 21:45'
labels:
  - ui
  - perf
  - size-M
milestone: m-32
dependencies: []
ordinal: 1021
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks unchanged tests/t0/kit_size after legitimate Data/Picker additions, both now on develop (Picker9dc934f5f, Data progress8f8478bd5). Data-only stable-source gate usedJS4118/component, strict total201 B over; all unused-family and AOT budgets pass. Picker-only gate usedJS4088 with71 B strict total headroom. Combined source must be measured, not added/guessed. Data final artifacts/fingerprints docs/reports/bench/kit-data-2026-11-09.json; Picker docs/reports/picker-proof-2026-11-09.json. Card defaultprops simplification was ordinary readability and savedlittle; no further kit microtrims or feature removal. Pure hash/utf8 identity helper reuse already removed broad eager web module dependency. Read-only generic lead: current reached provider has41 canonical documents with100 path elements whose only attribute is d; sharing a private path(d) SVG constructor can eliminate repeated exact XML fragments while preserving every body/alias/metadata and existing icon cache. This is a lead, not an implementation or saving claim: measure actual minified output and first-materialization allocation tradeoffs. Existing shared SVG root-wrapper serialization saved7409 B; never remove XML metadata or special-case names. Root will assign a read-only attribution agent separately; sole core1101 worker may implement after real cwd/default-icon blockers, totalbatchmax5. New task is for actual failing develop gate; no suite/benchmark, short exact proof only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unchanged final combined kit_size gate passes its existing unused-family and used-component budgets for AOT and JavaScript with Data and Pickers present; all shipped controls/options and requested icons remain
- [ ] #2 Attribute the combined failure with exact source/engine hashes and raw artifact bytes, then apply the smallest generic engine/provider or deliberate shared reuse fix with its own exact regression; do not raise budgets, cut UI, prune requested icons, or make special-case compiler rules for kit/demos
- [ ] #3 Original Data/Picker/default-icon behavior, valid SVG geometry/aliases/metadata and all three engines remain coherent; documentation/changelog and unmeasured runtime effects/remaining boundaries are recorded
<!-- AC:END -->
