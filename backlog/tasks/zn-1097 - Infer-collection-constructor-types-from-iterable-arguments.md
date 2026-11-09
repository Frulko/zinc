---
id: ZN-1097
title: Infer collection constructor types from iterable arguments
status: Done
assignee: []
created_date: '2026-11-09 20:56'
updated_date: '2026-11-09 21:18'
labels:
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1015
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks original ZN-1078.07 picker fixture. Minimal .worktrees/1078-pickers-proof/.logs/pickers-proof/set-repro.ts: const groups=['faces','people']; const unique=new Set(groups); console.log(unique.size); current checker emits Z0109. lib/zinc.d.ts228 promises generic Iterable constructor; check.cpp1950-1959 rejects before inspecting arguments unless explicit or expected type exists. D175 adds expected-type inference, not a prohibition on argument inference. Do not annotate app code to hide engine gap. Reuse collection generic inference across Set/Map, preserve expected/explicit constraints and errors. Primary research: https://www.typescriptlang.org/docs/handbook/2/functions.html#inference ; https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7#instantiation-expressions . Existing core1093 correction0ae64e937 is integrated. Sole core worker after1096; preserve other-session main WIP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Set and Map constructor iterable arguments infer existing generic types consistently with explicit and expected types; incompatible inputs remain clear errors
- [x] #2 Focused T0 covers arrays and existing iterable forms, empty/annotated/expected cases, unions and invalid inputs across interpreter, AOT and QuickJS
- [x] #3 Original Picker fixture checks and bounded feature proof pass without explicit-generic workaround; docs/changelog/limits and proposed tests are recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fresh original Picker public-barrel proof now returned: gallery and both model fixtures check unchanged; exact kit_pickers interpreter/QuickJS and explicit --native Solid/React full fixtures pass. Original Wheel/Ruler initial selected values and both scroll axes, plus all hidden TimePicker wheels on reveal, pass all three engines. No generic annotation, delayed scroll or cleanup-source workaround. Logs in .worktrees/1078-pickers-proof/.logs/pickers-proof/. Native binaries roughly6.7/6.5MB are feature artifacts, not comparative performance measurements. Unchanged kit_size also passes in the Picker source. AC3 checked and Done; independent existing nullable-string-key defect stays explicitly recorded for next fresh core task1100.
<!-- SECTION:NOTES:END -->

## Implementation and exact proof

Need → provider → gap: the existing collection constructor helper already copies arrays/collections and validates explicit/expected types, but rejected before looking at an argument. It now infers from the existing iterable's element or tuple positions. Direct Map entry literals receive tuple context from their first entry, while later entries retain normal compatibility checks. Strings/generators/custom iterators pass through one small generated array collector using existing for-of lowering, including order and generator close; no runtime duplication or dependency. Literal nullish arguments are empty when explicit/expected collection types exist. Empty untyped collections still report Z0109 under the existing inference policy; D175 did not prohibit argument inference.

- Short primary research verified TypeScript generic inference guidance (https://www.typescriptlang.org/docs/handbook/2/functions.html#inference) and constructor typing references already linked above.
- Warm `tools/build zinc` completed with no new warning. Exact `tests/run --only collection_infer` PASS interpreter/AOT/QuickJS: Set arrays/copies, Map typed/literal tuples/copies, strings, generators and a custom Symbol.iterator, Map from generator/Set tuples, explicit/expected/empty/nullish cases, nullable-number union elements, insertion order/source independence, and exactly one evaluation of the source. Invalid element/expected types, malformed Map entries, noniterables and uninferred empty constructors remain errors. Logs `.logs/1097/{build,check,test}.log`.
- Original Picker `set-repro.ts` checks without a generic annotation. Fresh Picker worker is running the original public-barrel fixture/gallery with this combined1097/1099 binary. AC3 stays open until that original caller proof returns; no app workaround.

### Separately confirmed pre-existing runtime defect

An expanded positive case found `new Set<string | null>(['one', null])` traps Set.add because nullable string keys are still classified as nonnull string keys. Confirmed the same explicit-type two-line program on the coordinator's clean pre1097 binary, exit1: `.logs/1097/nullable-string-{set.ts,baseline.log}`. Numeric nullable union constructors pass. This is not argument inference and no protected runtime source was edited. Coordinator received the repro for separate routing; do not claim nullable-string-key runtime support from this change. Proposed later line: `ZN-1097: nullable string Map keys/Set elements must retain a null-safe key representation; explicit typed two-line Set constructor currently traps.`

### Proposed tests

- `tests/run --only collection_infer`: exact inference/constraint/order regression, seconds after warm AOT cache.
- Original Picker full catalogue/keyboard/selection proof across models and engines; fresh caller worker is handling short runs, longer device/input/memory measurement remains owner-chosen milestone work.
- Broader generic collection/union combinations and nullable-string-key regression once the independent runtime defect is fixed; no suite or performance/memory measurement run.
