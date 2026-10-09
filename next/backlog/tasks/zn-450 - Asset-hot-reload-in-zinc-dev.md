---
id: ZN-450
title: Asset hot reload in zinc dev
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
  - ZN-436
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-import the changed asset, send it over the dev socket, swap it behind its handle and call assets.onReload; code changes still restart. Report: docs/reports/games/toolchain-assets-loading.md (8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 changing a sprite while game-2d runs updates the frame within 1 s with the score kept
- [ ] #2 a code change still restarts
<!-- AC:END -->
