---
id: ZN-964
title: 'Hamlet: atlas file cache with content-hash invalidation, first-run sliced bake'
status: Backlog
assignee: []
created_date: '2026-11-01 13:07'
labels:
  - hamlet
  - demo
  - m2
  - atlas
  - perf
  - size-M
milestone: m-30
dependencies:
  - ZN-954
  - ZN-963
ordinal: 720050
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atlas saved to <appdata>/atlas-<hash>.bin (header + packed frames); loaded on the next start; the key covers the atlas header inputs. Cache write failure (read-only media, web) falls back to memory. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Second start loads the atlas without baking (test counts bake calls)
- [ ] #2 Changing a palette, season, S/W/H or a draw function changes the hash and re-bakes; stale files are deleted
- [ ] #3 Corrupt or truncated file is ignored and re-baked
- [ ] #4 First-run bake is sliced (N frames per slice) behind a 'preparing' text and never freezes input
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: dropped. Atlas is exported as PNG sheets (assets/atlas, hamlet_atlas.sh) and checked by hash; a runtime file cache is not needed.
<!-- SECTION:NOTES:END -->
