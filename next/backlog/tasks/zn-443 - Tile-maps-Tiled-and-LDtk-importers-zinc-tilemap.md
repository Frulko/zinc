---
id: ZN-443
title: 'Tile maps: Tiled and LDtk importers, zinc:tilemap'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-438
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A script importer turns Tiled .tmj/.tmx and LDtk .ldtk into binary layers and typed objects, with tilesets through the atlas. A pure-Zinc zinc:tilemap draws the visible chunks. Report: docs/reports/games/toolchain-assets-loading.md (4.8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one Tiled and one LDtk level render like the editors' PNG exports within tolerance
- [ ] #2 load time is in the notes
<!-- AC:END -->
