---
id: ZN-1103
title: Preserve combined kit size budgets after Data and Pickers
status: Done
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
- [x] #1 The unchanged final combined kit_size gate passes its existing unused-family and used-component budgets for AOT and JavaScript with Data and Pickers present; all shipped controls/options and requested icons remain
- [x] #2 Attribute the combined failure with exact source/engine hashes and raw artifact bytes, then apply the smallest generic engine/provider or deliberate shared reuse fix with its own exact regression; do not raise budgets, cut UI, prune requested icons, or make special-case compiler rules for kit/demos
- [x] #3 Original Data/Picker/default-icon behavior, valid SVG geometry/aliases/metadata and all three engines remain coherent; documentation/changelog and unmeasured runtime effects/remaining boundaries are recorded
<!-- AC:END -->

## Attribution and implementation

Read-only reviewer exact scratch links reproduce the original bundles byte-for-byte before changing serialization. Combined baseline JS direct235400/index238485/ten275728 B, used37243 B total (strict379 B over). Source and engine hashes, exact esbuild flags and corrected3-byte banner offset are in .logs/1103/review-report.json; earlier scratch flags omitted __ZINC_CAPS__ and their intermediate figures are explicitly discarded. The provider has37/41 canonical documents and94/100 pure-d paths for index/ten. Whole-catalog byte savings do not predict used-component delta: index provider/helper is eliminated. Exact final prototype saves551 B in ten only, including --keep-names, with43/47 canonical/alias/unknown/empty inputs unchanged.

Primary SVG source: the d property defines a path's geometry (https://www.w3.org/TR/SVG2/paths.html#DProperty). Preserve its string exactly, including order. A private lucidePath(d) constructor now shares only the identical <path d=.../> envelope when d is the sole non-key attribute. Other shapes/attributes remain their original literal fragments. Root SVG attributes, bodies, all names/aliases, COUNT/NAMES/UNKNOWN and empty lookup are unchanged. No UI, budget, requested icon or inference rule changed. No new dependency.

The exact lucide_serialization T0 reconstructs expected complete documents from the pinned JSON and checks41 canonical names plus selected aliases, unknown/empty, and metadata across interpreter/AOT/QuickJS. It passes. Raw unchanged combined kit_size also passes: JS235400/238485/275177 B, unused3085<=8448 and4076 B/component<=4096,172 B strict total headroom. This is551 B smaller for ten versus the exact combined baseline. AOT5325320/5374848/5926624 B, unused49528<=135168 and61308 B/component<=65536; no isolated AOT saving is claimed across runtime/compiler changes. Original test SHA256d4516f5dbd449421d4cc872afdba00acc8f07c22c3f0476498b06cf4fbc032ed is unchanged.

Tradeoff: up to8 extra small constructor calls, plus string concatenations at cold materialization of an icon variant; existing (name,color,stroke,fill) cache remains. Runtime cost is unmeasured, with no speed or allocation-performance claim. Proposed owner-chosen milestone: quiet-machine cold-icon variant allocation/call work and broader device/UI replay; no benchmark or broad suite here.

Original library_icons T0 passes after serialization. Original gallery short headless runs pass: pickers-values interpreter, Data native, Feedback QuickJS (three frames each). Logs .logs/1103/callers.log, serialization-and-size.log; source/binary provenance .logs/1103/provenance.json. No broad suite, benchmark, device run or cold-materialization timing was run.
