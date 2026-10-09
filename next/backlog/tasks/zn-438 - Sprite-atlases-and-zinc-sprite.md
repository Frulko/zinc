---
id: ZN-438
title: 'Sprite atlases and zinc:sprite'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-432
  - ZN-434
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor stb_rect_pack and stb_image_resize2. Sprite importer: trim, extrude, padding, pages per max size, POT, .aseprite through cute_aseprite, TexturePacker JSON-hash input. Pure-Zinc zinc:sprite plugin for frames, animations and pivots. Report: docs/reports/games/toolchain-assets-loading.md (4.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 game-2d draws from one atlas page
- [ ] #2 frames at 1x are pixel-identical to the loose images
- [ ] #3 display-gl draw calls of the play scene before and after are in the task notes
<!-- AC:END -->
