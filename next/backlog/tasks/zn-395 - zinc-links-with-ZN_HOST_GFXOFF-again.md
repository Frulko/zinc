---
id: ZN-395
title: zinc links with ZN_HOST_GFX=OFF again
status: Backlog
assignee: []
created_date: '2026-10-09 03:40'
labels:
  - build
  - size-S
dependencies: []
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-332: configured with -DZN_HOST_GFX=OFF, main.cpp still calls zn::host (installResources, benchScene, damageCheck, replayScene) and zn::host::perm::configure, so zinc does not link. Guard those commands with ZN_HOST_GFX (they report that the build has no graphics host) and keep perm in a library that is always linked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cmake -DZN_HOST_GFX=OFF builds zinc; a headless program runs; the graphics commands say the build has none
<!-- AC:END -->
