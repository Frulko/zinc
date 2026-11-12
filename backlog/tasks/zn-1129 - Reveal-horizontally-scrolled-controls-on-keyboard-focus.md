---
id: ZN-1129
title: Reveal horizontally scrolled controls on keyboard focus
status: Backlog
assignee: []
created_date: '2026-11-12 12:20'
labels:
  - ui
  - size-S
milestone: m-10
dependencies: []
ordinal: 17502
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1039 production ScoreGrid keyboard access to rightmost score cells. Tab selects the offscreen Input, but the enclosing horizontal ScrollView stays at sx=0. Minimal original proof in .worktrees/1039-counter-scores/.logs/stage-focus2/interp.log reports focused 5==last, sx 0 expected 400 and exit101; production .logs/stage-ui3/interp.log and stage-ui4/scores.png retain the real grid evidence. lib/std/ui.ts revealFocus (around6251-6267 in clean source) only adjusts vertical sy, never horizontal sx. Correct the shared focus/scroll provider, not an application focus/scroll callback. The owner holds ui.ts Virtual/Fenwick WIP (canonical payload6e6c6a9a1301c93e1bf6890183faf7df8b733442430720fff59c951a82e7f1cc). Do not edit that file until a disjoint carve-out is explicitly established; keep all existing owner payloads intact. No application workaround or hidden required columns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tab and programmatic focus reveal the focused control horizontally in its enclosing scroll containers, including the unchanged minimal Input and production ScoreGrid cases.
- [ ] #2 A focused T0 covers horizontal and nested axes, clamping and existing vertical/on-screen-keyboard/layer behavior without breaking pointer scroll or stealing editing keys.
- [ ] #3 The shared UI provider fix and regression preserve the owner Virtual/Fenwick changes; the original app keeps ordinary inputs with no manual focus-scroll workaround.
<!-- AC:END -->
