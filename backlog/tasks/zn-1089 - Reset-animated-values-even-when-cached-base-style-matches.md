---
id: ZN-1089
title: Reset animated values even when cached base style matches
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 14:36'
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
- [ ] #1 Explicit zero-duration animation and stopSeries+same-base setter reset the actual evaluated value after compositor progress, without stale continuation
- [ ] #2 Small exact T0 drives rotate and relevant transform/reset/restart cases across interpreter AOT QuickJS and preserves ordinary style equality fast paths
- [ ] #3 Original Feedback reduced-motion fixture passes unchanged, public behavior/changelog/notes agree and no app-local workaround remains
<!-- AC:END -->
