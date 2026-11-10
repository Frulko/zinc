---
id: ZN-1110
title: Preserve JSX map rows with trailing call commas
status: Done
assignee: []
created_date: '2026-11-10 01:12'
updated_date: '2026-11-10 01:43'
labels:
  - frontend
  - jsx
  - size-M
milestone: m-32
dependencies: []
ordinal: 1028
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original formatted ZN-1078.17 MonthCalendar: valid .map(callback,) silently stops mounting JSX children while .map(callback) mounts four. Minimal committed original repro .worktrees/1078.17/tests/data/kit_planning/map-trailing.tsx; coordinator copies/logs .logs/blockers/jsx-map-trailing. Frozen clean engine source7774708ca SHA256f561c4cc76172c731e4109cd9161b5a7092ffda9553260f25351a0a1e329fce1. Source path src/frontend/jsx.cpp listAt near726 currently treats every top-level comma as extra argument and returnsJsx/named callback bounds may also include trailing separator. Reuse token/call argument bounds; do not remove commas, alter Prettier settings, rewrite callbacks or copy layout into apps. Planning full source stays normally formatted checkpoint78c13d3ea (all AC open), not integrated until engine fixed. Preserve actual extra-argument diagnostics, one evaluation/order, JSX ownership and canonical Solid/React/custom-helper contracts. Primary research verified coordinator2026-11-10: ECMAScript Arguments grammar allows trailing comma https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#prod-Arguments ; official Prettier trailing-comma option https://prettier.io/docs/options#trailing-commas . Fresh sole core worker next slot; no layout/runtime/UI changes, main external WIP untouched. Exact focused regression/all3 and original formatted Planning proof, no suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Valid trailing call commas preserve mapped JSX rows for direct and nested callbacks, including normally formatted renderSlot block returns and named/imported JSX functions, with no application workaround
- [x] #2 Focused T0 covers canonical Solid/React and existing helper contracts on interpreter/AOT/QuickJS, equal node counts/content/order with and without comma, once-only evaluation and unchanged actual-extra-argument/invalid-call diagnostics
- [x] #3 Original formatted Planning MonthCalendar and affected gallery/control callers pass without removing commas or changing formatter, with docs/changelog/provenance/limits and proposed tests recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### Research and correction

- Focused primary lookup: [ECMAScript Arguments grammar](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#prod-Arguments) permits a final separator without adding an argument; [Prettier trailing commas](https://prettier.io/docs/options#trailing-commas) makes this normal formatted source. Sonnet unavailable and slots occupied: worker performed the short lookup directly. No dependency or new decision number.
- Normalize the exclusive call-argument end once in one token helper, reused by list recognition, callback extraction and JSX-returning wrapper recognition. A final separator no longer masks named/imported JSX callbacks or leaks into the generated Solid `_for` argument list. Real interior separators still count as additional arguments. React keeps the original call; existing indexed/canonical and legacy helper ABIs are unchanged. No runtime/layout change, user-source rewrite or formatter exception.
- Added exact `jsx_map_trailing` T0 and affected-path mapping. Solid and React each cover direct arrows, block-local returns, named/imported functions, indexed callbacks, nested maps/renderSlot with parenthesized block returns, conditionals, wrapper callbacks and ordinary number maps. Assertions compare ordered label counts and text content against comma-free controls and count receiver/callback evaluations. A custom helper facade covers the legacy component/helper contract. Negative calls retain Z0104 (actual second argument) and Z0001 (missing argument).

### Proof and provenance

- Built only `tools/build zinc` in this worktree, base `6b102a3d21a0b3fb803281cdacc79f925e2580d7`. Binary SHA256 `7a6b2450b4adcb1826d77286714ad8c60091dea77c3175f403e4a40d3b99d27d`; `src/frontend/jsx.cpp` SHA256 `bc4448488f70583c536efa7b8f2d8ae38d3bb7c1f288439a5e8478461f77d00c`. Build succeeds; 107 existing warning diagnostics across unrelated source/vendor files, none in edited jsx.cpp. Raw `.logs/1110/build.log`; no claim of a globally warning-free build.
- Exact focused T0 passes Solid/React/custom on interpreter, native AOT and QuickJS, plus both diagnostics. Script stdout `.logs/1110/candidate.log`; final strengthened custom wrapped-child assertion separately passes all three, raw `.logs/1110/custom-{interp,native,quickjs}.log` and summary `custom-proof.log`. No C++ change since the build.
- Original parked Planning checkpoint `78c13d3ea5362e86fedfe02508d2a74595e412fb` is untouched and clean. Its committed `map-trailing.tsx` prints no cells on frozen baseline f561c4cc, and exactly `cell 0,0`, `cell 0,1`, `cell 1,0`, `cell 1,1` on all three candidate engines. Raw `.logs/1110/original-{baseline,interp,native,quickjs}.log` and `original-proof.log`.
- Original normally formatted Month gallery passes `zinc check` and three-frame headless runs on all three engines. Inspected all three `month-{interp,native,quickjs}.png`: day cells, multi-day spans, Review/overflow and Share your work are mounted. Raw `gallery-check.log`, `gallery-{interp,native,quickjs}.log`, `gallery-proof.log`. No pixel comparison, performance or hardware claim. All evidence and hashes are retained in this worktree's `.logs/1110/provenance.json`.
- Planning family SHA256 remains `18ff19d9a0af4c0f53f83214651a7f7decfae2e3abf76bf27100d465d4f48160`; original controls fixture remains `bc54f64d1710bc254a2320dc84594cd0e1c3d4e90ba7759f8151f9d16fb8ff14`. `ZINC_ROOT` explicitly selected the parked Planning tree for these proofs; sibling native archives stayed beside the candidate binary.

### Remaining handover

AC3 stays open: unchanged `tests/t0/kit_planning.sh` passes pure models on all three engines and complete Solid controls on all three, then React interpreter fails `keyboard drop retains card focus` before reaching its month interaction. Raw `.logs/1110/planning-controls.log`. The trailing-map fix and original Month gallery are proven, but the complete final controls claim is not. Coordinator should integrate this correction and send the fresh Planning completion worker to investigate its Kanban focus assertion and finish the original task; do not delete that assertion or alter valid trailing commas. No new task/decision/later line allocated.

### Proposed tests

- After integration: `ZINC=<integrated binary> ZINC_ROOT=<Planning worktree> sh tests/t0/kit_planning.sh` via the global bounded queue; verifies final React Kanban focus and all Planning interactions, roughly seconds to a minute depending on native cache, memory not measured.
- At an owner-selected UI milestone: existing JSX ownership/list/helper regressions and manual Planning light/dark/narrow keyboard/pointer sweep; no suite or size gate run in this engine task. Planning completion retains its unchanged gate and picture obligations.

All builds, checks and apps used the global `tools/work-run` queue, per-run timeouts and headless mode. No owned processes remain. No push, coordinator documents, external WIP or Planning source changes.
usage: n/a

Consumer AC3 now proven by fresh Planning completion worker: unchanged final kit_planning T0 PASS pure models all3 and complete Solid/React controls all3 with normally formatted trailing commas on rebuilt common397865. Remaining Kanban failure was component identity: BoardCard needed its own key, keyed host View alone does not key its component instance; one caller correction, no delayed events/weak assertions/mirrors. Original Month/gallery restored, six fresh captures inspected and gallery check47files PASS. Root final jsx_map_trailing/kit_ai/unchanged kit_size also PASS on common source90b24121b. Logs .worktrees/1078.17-complete/.logs/planning-complete/t0.log and .logs/integration-2026-11-10/after1110-*; pending Planning feature commit/gate remains its task.
<!-- SECTION:NOTES:END -->
