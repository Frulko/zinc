---
id: ZN-1082
title: Accept dynamic JSX grab policy
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 12:15'
updated_date: '2026-11-09 12:26'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1071
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the vertical/horizontal Slider in examples/ui/kit-gallery (ZN-1078.08). src/frontend/jsx.cpp only accepts literal grab keywords. Valid View grab={vertical ? 'keep' : 'keep-x'} is rejected with Z0005. Preserve the original component expression and fix the shared frontend path for Solid/React, interpreter/AOT/QuickJS.

Supported Zinc-owned values only: keep=1 (scroll never steals), keep-x=2 (mostly horizontal gestures kept; vertical can scroll), auto/default=0. There is no keep-y; no new enum value or gesture-machine feature is requested. Existing native setNumber(grab) already applies these policies; preserve literal diagnostics, evaluate a dynamic expression once per apply and reapply reactively, use existing default behavior for unknown dynamic values.

Research delegated before work: Zinc docs/ui.md section gesture arbitration, adjacent pointerEvents/inputMode dynamic lowering; Flutter https://api.flutter.dev/flutter/widgets/RawGestureDetectorState/didUpdateWidget.html synchronizes recognizer configuration; RNGH https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/gesture-detector/ updates native handlers from config and https://docs.swmansion.com/react-native-gesture-handler/docs/guides/troubleshooting/ distinguishes updates from active gesture state. Zinc grab is its own scroll arbitration policy, not HTML touch-action or DOM pointer capture. Reuse existing frontend mapping/binding machinery; no runtime gesture rewrite or component workaround.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dynamic grab maps the existing keep, keep-x and auto policies on Solid and React across interpreter, AOT and QuickJS
- [x] #2 A narrow T0 covers one expression evaluation, reactive policy updates, default handling and unchanged invalid literal diagnostics
- [x] #3 The original Selection slider with its supported dynamic grab expression checks and runs without a component workaround
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research and scope (2026-11-09): inspected docs/ui.md gesture arbitration, frontend literal grab/pointerEvents/inputMode lowering, Solid _dynNum and React _num, native applyInteraction(grab), and touchAt/scrollTop. The native setter already implements keep=1, keep-x=2, auto/default=0. Reuse the adjacent once-evaluated string mapping and provider binding paths; no runtime or component change, dependency, keep-y policy, or public test-only getter. Delegated research: Flutter synchronizes recognizer configuration at https://api.flutter.dev/flutter/widgets/RawGestureDetectorState/didUpdateWidget.html; RNGH updates native handler configuration at https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/gesture-detector/ and distinguishes active gesture state in https://docs.swmansion.com/react-native-gesture-handler/docs/guides/troubleshooting/. Zinc grab remains Zinc scroll arbitration, not DOM capture or HTML touch-action. Smallest complete reach: shared frontend, one T0 with Solid/React fixtures, affected-test mapping, gesture docs, changelog. No lifecycle introduced or altered.

Implementation: four shared frontend lines accept expression-valued grab, capture the string once in an immediately invoked typed arrow, map only keep/keep-x to 1/2 and everything else to auto=0, then use Solid _dynNum or React _num. Literal validation is unchanged. Existing runtime/gesture machine and original slider source remain untouched. Added jsx_grab T0 fixtures for Solid/React, actual synthetic touch capture/cancellation and scroll arbitration, keep -> keep-x -> auto -> keep -> unknown -> keep-x -> empty -> uppercase changes, once-per-apply read count, and invalid keep-y literal Z0005. Added affected-test mapping, gesture docs and one changelog line. Validation: tools/build zinc passed; changed frontend emitted no warning, fresh build had existing rg_etc1 unused-expression, src/agent/dev.cpp missing Program::args initializer and nanosvg signedness warnings. timeout 180 tests/run --only jsx_grab passed all six provider/engine combinations and invalid literal in 13.67 s real; /usr/bin/time maximum RSS 86,016,000 B is indicative only, no performance claim. timeout 20 build/zinc check tests/data/jsx_grab/solid.tsx and react.tsx passed in 0.18/0.16 s at 39,419,904/39,485,440 B maximum RSS. sh -n, affected JSON parse and diff whitespace check passed. All runs headless, bounded and serialized under coordinator heavy token; build and test processes exited. Usage: n/a. No suite/T1/T2/demo/pixel/benchmark/conformance/fuzz/cross-platform run.

Original Selection proof (source-owning worker): .tmp-selection-slider/main.tsx directly imports the unmodified lib/std/kit/slider.tsx, whose grab={vertical ? 'keep' : 'keep-x'} expression is retained, and mounts horizontal and vertical controls. With ZINC_ROOT set to the Selection worktree and this rebuilt binary, timeout-bounded zinc check passed (0.025 s wall), headless ZINC_FRAMES=2 --interp passed (0.145 s), --engine quickjs passed (0.078 s), and --native passed (about 5.1 s including build). RSS was not measured for these short proofs; no process remains. The full gallery advances past grab and reports a separate authored RadioCards nested array-map checker issue, already handed to the coordinator; no slider workaround was used. All three criteria are met. Proposed tests: rerun tests/run --only jsx_grab after integration at the chosen milestone (about 14 s, indicative peak RSS 86 MB); physical touch/cross-target smoke remains unproven. No decision number, later.md line or performance claim required for this reuse of existing semantics.
<!-- SECTION:NOTES:END -->
