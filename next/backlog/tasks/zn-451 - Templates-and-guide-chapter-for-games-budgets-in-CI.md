---
id: ZN-451
title: Templates and guide chapter for games; budgets in CI
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-437
  - ZN-438
  - ZN-440
  - ZN-441
  - ZN-447
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the game-2d template (atlas, sounds, groups, loader) and the 3d template (model importer, loader). Add a guide chapter 'Games: assets and loading'. Put budgets in the templates' zinc.json and check them in tests/t1/templates_kickstart.sh. Report: docs/reports/games/toolchain-assets-loading.md (11).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the templates test runs zinc assets check
- [ ] #2 the chapter lists every shipped command and key
<!-- AC:END -->
