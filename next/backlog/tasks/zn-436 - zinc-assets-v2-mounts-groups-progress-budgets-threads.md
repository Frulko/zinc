---
id: ZN-436
title: 'zinc:assets v2: mounts, groups, progress, budgets, threads'
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-433
  - ZN-435
  - ZN-314
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mount table with overlays; loadGroup/unloadGroup/prefetch with byte progress; reference-counted handles; priority queues; accounting against the target budget; decoding on the libuv thread pool (sliced per frame on one-core targets); a per-frame upload budget. The v1 calls read through the packs, and AOT programs find their packs. Report: docs/reports/games/toolchain-assets-loading.md (6.3 to 6.6).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a headless test loads three groups with monotone progress ending at 1
- [ ] #2 unloading frees the memory (zinc mem)
- [ ] #3 a load over budget fails, naming the group and the budget
- [ ] #4 frames are deterministic under ZINC_DETERMINISTIC=1
- [ ] #5 the AOT build of examples/hero runs (ZN-314's AC)
<!-- AC:END -->
