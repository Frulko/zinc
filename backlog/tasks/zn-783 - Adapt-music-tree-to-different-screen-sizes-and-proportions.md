---
id: ZN-783
title: Adapt music-tree to different screen sizes and proportions
status: Done
assignee: []
created_date: '2026-10-23 13:23'
updated_date: '2026-10-23 14:42'
labels:
  - ui
  - demo
  - size-M
dependencies: []
ordinal: 519460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Music-tree lays out playback and navigation for compact landscape, portrait and desktop screens without cropped controls.
- [x] #2 Native headless checks cover representative sizes and the existing music integration remains valid; docs and changelog updated.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented native Linux dimensions and adaptive stage layouts for player/navigation, media grids, settings, sheets, clocks/weather/rings and notifications. Read-only review found and fixed compact notification header/empty-state collisions and Spotify artist/album/search overflow. Reused stage scrolling and one mutable PlayerLayout. Verified zinc check (44 files); music_layout PASS (28 geometry combinations); music_tree_responsive PASS (43 s, 19 real-node captures with inert services, visible touch bounds and Play/scroll/close assertions plus one reviewed 800x480 golden); music_tree_sonos PASS (4 s, fake-house idle/clipped input/playback handoff); ci_plan PASS; git diff --check clean. No engine build needed. Physical Pi touch/rotation/frame time deferred in backlog/later.md; no device update, cross build, push or publication. Details: docs/reports/zinc-next-music-responsive.md. Usage: n/a for Codex.
<!-- SECTION:NOTES:END -->
