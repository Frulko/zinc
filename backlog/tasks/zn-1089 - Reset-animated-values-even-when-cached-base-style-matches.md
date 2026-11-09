---
id: ZN-1089
title: Reset animated values even when cached base style matches
status: Done
assignee: []
created_date: '2026-11-09 14:36'
updated_date: '2026-11-09 14:38'
labels:
  - ui
  - perf
  - size-S
milestone: m-32
dependencies: []
type: bug
ordinal: 1009
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks Feedback ZN-1078.11 live reduced motion. Engine-only repro .worktrees/1078-overlays-resume/.logs/feedback-rotate-repro/main.tsx imports ui+solid, no kit: start rotate0 then compositor loop360/900ms, tick120 =>48deg; ui.animate(node,rotate,0,0,linear,0) and tick1 leaves48, throws. Also stopSeries + setNumber(node,key,0) fails when cached base style already0 although evaluated value changed. Do not fix Spinner locally.

Likely showComp updates actual n.tf without changing underlying styleVals, and setNumber equality guard returns on cached0. Underlying style and animated evaluated value are distinct legitimate values; fix explicit reset/cancel at the shared operation, not by accidentally committing every animated value as base style. Check callers and rotate/translate/scale/opacity relevant paths, no ongoing animation after explicit stop/reset. Keep compositor/CPU/native semantics aligned. Primary research: https://www.w3.org/TR/web-animations-1/ underlying values, effect stack and cancellation. Reuse existing animation lifecycle/cancel primitives; no new state flags or broad animation rewrite. Main ui.ts Virtual/Fenwick WIP near636/967 belongs to others; only isolated animation/property hunks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Explicit zero-duration animation and stopSeries+same-base setter reset the actual evaluated value after compositor progress, without stale continuation
- [x] #2 Small exact T0 drives rotate and relevant transform/reset/restart cases across interpreter AOT QuickJS and preserves ordinary style equality fast paths
- [x] #3 Original Feedback reduced-motion fixture passes unchanged, public behavior/changelog/notes agree and no app-local workaround remains
<!-- AC:END -->

## Implementation Notes

- Research supplied by the coordinator before implementation: [Web Animations underlying values and effect stacks](https://www.w3.org/TR/web-animations-1/). Animated evaluated values remain separate from the underlying style; cancellation/reset must apply the requested value to the evaluated field. No dependency or new lifecycle is needed.
- `setNumber` retains the cached equality return for ordinary properties; compositor properties additionally compare the evaluated field before skipping a write. This covers rotate, translateX/Y, scaleX/Y and opacity, explicit zero-duration replacement, series end/reset and stopSeries followed by its cached base. No animation sample is committed to the underlying base merely for being sampled. Existing Anim/compStop lifecycle and native/CPU paths stay shared.
- Scope read: animate/animateSeries/stopSeries/stepAnims/showComp/compStop, transition/property writers, Animated/native driver, Solid animate, kit motion/spinner/imageviewer callers. No caller or public signature change. Profiling counters and focus disposers are untouched.
- Proof: exact `tests/run --only ui_animation_reset` passed with the retained clean engine and this worktree's library. Interpreter, native AOT and QuickJS each pass with compositor off/on; the fixture requires all six series to be layered when enabled, then checks stop/reset, infinite rotate replacement, restart, absence of stale continuation and idle equal writes (including normalized font weight).
- Original Feedback fixture `.worktrees/1078-overlays-resume/.logs/feedback-rotate-repro/main.tsx` ran unchanged for three deterministic headless frames on all three engines: rotate 47.999999999999986 → 0, exit 0. `zinc check tests/data/ui_animation_reset/main.ts` and `git diff --check` passed. No C++ engine change/build, suite or process left behind.

## Proposed tests

- At the chosen UI milestone: existing compositor/animated_native/UI transition feature comparisons, to cover long-running layer/native behavior beyond this exact reset (roughly 1 minute; one app process at a time).
