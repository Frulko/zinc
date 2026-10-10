---
id: ZN-652
title: Fused apps and .zapp archives carry the native plugins their program calls
status: Backlog
assignee: []
created_date: '2026-10-10 17:57'
labels:
  - packaging
  - plugins
  - size-M
milestone: m-19
dependencies: []
ordinal: 398410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-390: a game packed normally (zinc pack, zinc fuse) builds or fetches its native plugin where it starts: 50 s and a toolchain download in an empty HOME, so tests/t0/fuse.sh packs game-2d with ZINC_DETERMINISTIC=1 to bind the Zinc stand-in instead. A packed app must hold the built plugin libraries for its target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc fuse of templates/game-2d packed normally plays in an empty HOME with no download and no build
- [ ] #2 fuse.sh drops its ZINC_DETERMINISTIC=1
- [ ] #3 the archive lists the plugin libraries and their hashes
<!-- AC:END -->
