---
id: ZN-448
title: 'Pre-launcher stage, zinc-launcher plugin, settings and mods'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-436
  - ZN-447
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
launcher key. Stage API: mounted packs, settings, update check through zinc:system/update, and a mod list as overlay packs in mount order. Adds zinc:app/settings and a skippable zinc-launcher plugin on zinc:ui. Report: docs/reports/games/toolchain-assets-loading.md (7.4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a zinc sim scenario chooses fullscreen and enables a mod, and the game sees the setting and the mod's replacement asset
- [ ] #2 --skip-launcher and 'do not show again' work
<!-- AC:END -->
