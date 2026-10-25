---
id: ZN-800
title: 'Re-skin pinball, pinball3d and pocket-hero with Kenney CC0 packs'
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
updated_date: '2026-10-25 11:11'
labels:
  - size-M
milestone: m-22
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- Owner 2026-10-17: every game demo uses Kenney's assets (kenney.nl, CC0), adapted per platform: re-skin pinball, pinball3d and pocket-hero with Kenney packs as they are next worked on (breakout in ZN-753, platformer and marble in ZN-754).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pinball, pinball3d and pocket-hero use Kenney assets (CC0), credited in their README
- [ ] #2 Goldens and T1 tests of the three demos updated and passing
- [ ] #3 Assets adapted per platform through the asset pipeline (no new runtime code)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 partial owner-requested work: Nova Patrol uses Kenney Puzzle Pack ballGrey and particleSmallStar sprites with their CC0 source/licence; Tidal Lock uses the Kenney star in a reproducible bumper-cap texture and ships its credits. Both score panels and the space art were refreshed. Pocket Hero and a complete per-platform asset pass remain outside this pinball request; do not mark this multi-demo task Done.
<!-- SECTION:NOTES:END -->
