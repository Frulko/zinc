---
id: ZN-671
title: >-
  examples/nuxt-ui: the trash-2 icon is silently missing (the pinned Lucide set
  names it trash)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:06'
updated_date: '2026-11-08 20:06'
labels:
  - ui
  - bug
  - size-S
dependencies: []
ordinal: 2700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum editor (ZN-650.07): examples/nuxt-ui/zinc.json lists the icon trash-2, which the pinned Lucide set no longer has (it is trash), so that icon draws nothing and nothing says so. Rename it in the demo, and make a missing icon name of zinc.json a build warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the icon draws in the nuxt-ui demo (pixel golden updated with the reason)
- [x] #2 an unknown icon name in zinc.json gives one warning naming it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).
- Research: Lucide 1.x keeps trash-2 only as a deprecated alias export of trash (lucide-static.mjs 'Trash, Trash2 from ./icons/trash.mjs'; icons/trash.json aliases [{name: trash-2, deprecated: true}]).
- trash-2 renamed to trash in examples/nuxt-ui (zinc.json, overlays.tsx, dashboard.tsx), examples/discord, examples/carnet, examples/carnet-nbe and templates/desktop-app; no other name of the repo is outside the pinned set (scan of examples, app, templates, lib, plugins, tests/golden).
- Golden: tests/golden/nuxt-ui/hashes.txt 'menu light' ea5ae4ba0023e75a -> 44f876e927c21cfe, frame looked at: the dropdown's Delete item now shows its trash icon, nothing else moves. The other rows do not show the icon (the dashboard's Delete button appears only with a selection).
- AC2 comes from ZN-1004 (U0001): an unknown name in zinc.json "icons" prints one warning with the closest name ('bel' -> 'did you mean bed'), an old name draws the new icon and says so; checked with a zinc.json-only name.
- Carnet's and Discord's trash icons show on hover only, so their frame goldens are not expected to move.
- Proposed tests: tests/run --only nuxt_ui (whole table), carnet, carnet_nbe, discord.
<!-- SECTION:NOTES:END -->
