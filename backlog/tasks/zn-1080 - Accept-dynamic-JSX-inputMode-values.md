---
id: ZN-1080
title: Accept dynamic JSX inputMode values
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 11:23'
updated_date: '2026-11-09 11:52'
labels:
  - ui
  - frontend
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1051
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks Inputs in examples/ui/kit-gallery (ZN-1078.06). Literal inputMode is supported, but a valid JSX expression is rejected with Z0005 unknown attribute because src/frontend/jsx.cpp only accepts lit && kInputModes.count. Preserve the component's idiomatic dynamic attribute; fix frontend lowering shared by interpreter, AOT and QuickJS, with a focused regression.

Minimal example: const mode = 'numeric'; const App = () => <Input inputMode={mode} />;

Existing native ui.fieldMode contract reported by worker: 0 text, 1 numeric, 2 decimal, 3 tel, 4 email, 5 url, 6 search. Preserve supported literal diagnostics; unknown dynamic values fall back to the native default. Handle an expression once per apply and reactive updates. Do not confuse input modality with content validation.

Research already delegated by coordinator before work: WHATWG https://html.spec.whatwg.org/multipage/interaction.html#attr-inputmode and https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#keywords-and-enumerated-attributes; React https://react.dev/reference/react-dom/components/common and https://react.dev/reference/react-dom/components/input. React documents inputMode as string; WHATWG defines enumerated keyboard hints and default handling. Useful pitfalls: expression must evaluate once, reactive change must update the hint, ordinary field type remains separate. No new dependency required.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dynamic inputMode for existing supported modes checks and runs correctly on interpreter, AOT and QuickJS without a component workaround
- [x] #2 A narrow T0 checks initial numeric mode, reactive updates, single expression evaluation, default handling and unchanged invalid literal diagnostic
- [x] #3 The original Inputs component with its dynamic inputMode passes zinc check and a short real gallery/component run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-09: JSX expression inputMode lowering now uses the existing kInputModes enum and the existing _dynNum (Solid) / _num (React) apply paths. A typed string lambda evaluates the expression and lowercasing exactly once per apply; unknown or empty dynamic strings choose default text mode 0. Supported literal lowering and its Z0005 invalid-literal diagnostic are unchanged. No helper export, component workaround, dependency, public ABI or runtime contract change.

Scope/callers checked: shared frontend JSX lowering, Solid/React helpers, kit host, ui.setNumber/fieldMode, existing inputMode consumers and semantic-hint docs. Research delegated by coordinator before work: WHATWG enumerated input modality and default rules (https://html.spec.whatwg.org/multipage/interaction.html#attr-inputmode, https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#keywords-and-enumerated-attributes) and React string inputMode prop (https://react.dev/reference/react-dom/components/common, https://react.dev/reference/react-dom/components/input). It is a keyboard hint; the regression keeps nonnumeric field content unchanged.

Evidence: tools/build zinc succeeded in this clean worktree; changed jsx.cpp warning-free (baseline full-tree warnings in V8 SDK, assets/cook, agent/dev and vendored sources remain). ZINC_ROOT=$PWD ZINC=$PWD/build/zinc timeout 180 tests/run --only jsx_input_mode PASS: both Solid and React, interpreter/explicit native AOT/QuickJS, 12 frames each, all seven supported modes, mixed case, empty/unknown fallback, live updates and exactly one expression evaluation per apply, plus unchanged invalid quoted literal diagnostic. zinc check tests/data/jsx_input_mode/{solid,react}.tsx both PASS. Original Inputs component proof pending upstream Button APIs integration; fresh binary path provided to Inputs worker. Heavy token released; no process left.

Proposed tests: original Inputs component/gallery short run on all three engines after integrated Button APIs, about 3-12 frames plus native compilation, RSS unmeasured. Physical soft keyboards and cross-target UI changes remain milestone checks; no suite, benchmark, cross build or performance claim.

Original feature proof (Inputs worker after rebase fc75c5744, 2026-11-09): production Inputs computed inputMode remains unchanged. With binary /Users/mowmow/Lab/zinc/.worktrees/1080-inputmode/build/zinc and ZINC_ROOT=$PWD, timeout15 zinc check examples/ui/kit-gallery PASS (9 files); GALLERY=inputs ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SIZE=1120x900 timeout20 zinc run examples/ui/kit-gallery --interp PASS, and the same short run --engine quickjs PASS. Explicit native AOT full gallery including Inputs also PASS: ZINC_ROOT=$PWD ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SIZE=1120x900 timeout25 zinc run examples/ui/kit-gallery --native (11.1 s native build, indicative, not a benchmark). No production workaround or leftover process. The Inputs worker separately investigates its authored event-fixture array-bounds failure in ZN-1078.06; this mode check and original gallery proof pass.

Rebase safety: explicit 1080 WIP saved in a00d1a27c30b834bab9a11422fd490209da87ae6, rebased to integrated Actions/App chrome fc75c5744, reapplied; CHANGELOG conflict resolved retaining both lines, docs table/affected mapping merged. No C++ source changed upstream, so the already-built engine remained valid. No shared RESUME/priority/keys/decision/perf changes. usage: n/a.
<!-- SECTION:NOTES:END -->
