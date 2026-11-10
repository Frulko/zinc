---
id: ZN-1117
title: Dispose Solid app ownership when the mounted root is destroyed
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 03:24'
labels:
  - ui
  - size-M
milestone: m-32
dependencies: []
ordinal: 1249.1
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music natural canonical entry render(()=> <App/>, background,null) registers owned model cleanup in App but ui.destroy(ui.rootNode()) does not run Solid onCleanup. Minimal9line Probe counter no audio/1116 dependence .logs/blockers/solid-root-dispose/solid-root-dispose.tsx and actual QuickJS failing log; original playing Music model remains Playing rather than Disposed after root destroy. Solid render normal path calls app() without root owner (hot mode alone uses newRoot); JSX component route also lacks destroy bridge. Fix shared Solid root ownership/disposal, not per-app createSubtree workaround. Reuse existing Computation ownership/dispose and UI onDestroy, preserve hot replacement, error unwind and renderWindow callers as appropriate. Do not invent a new API/framework or change application cleanup contract. Primary reference https://docs.solidjs.com/reference/lifecycle/on-cleanup and https://docs.solidjs.com/reference/rendering/render ; short primary lookup root, Sonnet unavailable. Scope lib/std/solid.ts/tests only, no compiler/IR worker1116 files, no protected ui.ts/runtime/HAL external WIP.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ordinary canonical Solid render owns App onCleanup and disposes it exactly once on root destroy/replacement, with throws/restarts and hot/window caller contracts preserved using existing lifecycle helpers
- [ ] #2 Small exact T0 all3 and original Music owned playback/timer disposal proof pass without entry workaround; public kit size limits remain unchanged
<!-- AC:END -->
