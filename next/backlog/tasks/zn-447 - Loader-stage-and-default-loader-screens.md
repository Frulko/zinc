---
id: ZN-447
title: Loader stage and default loader screens
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-436
  - ZN-446
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
loading key. The engine runs the loader module each frame while it preloads the declared groups, then starts main. Default screens (a bar; the splash with a bar) ship as a plugin for zinc:gfx and as a zinc:ui component. Supports minMs and fadeMs; the loader is skipped when the groups are already resident. Report: docs/reports/games/toolchain-assets-loading.md (7.5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 game-2d has a loading screen
- [ ] #2 progress is monotone (test)
- [ ] #3 the loader's frames are deterministic (golden)
<!-- AC:END -->
