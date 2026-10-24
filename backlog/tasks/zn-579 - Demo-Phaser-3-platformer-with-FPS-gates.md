---
id: ZN-579
title: 'Demo: Phaser 3 platformer with FPS gates'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-565
  - ZN-566
  - ZN-411
  - ZN-568
  - ZN-569
  - ZN-570
  - ZN-573
  - ZN-574
ordinal: 10900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Not 'only the FPS gate': examples/js-phaser is a star catcher (README) without the Tiled tilemap, sounds/music, gamepad or title/play/game-over scenes the task names, and ZN-578 (PixiJS bunnymark) covers none of Phaser. Rewrite to what is wanted on js-phaser (300 arcade bodies gate, scripted score test) or drop the platformer content explicitly.

examples/games/phaser-platformer: Tiled tilemap, arcade physics, animated sprites, text, sounds and music, keyboard and gamepad, title/play/game-over scenes. Measured today (QuickJS, M1 Pro): 16 us per arcade sprite, ~1,000 at 60 fps, max frame 84 ms (GC). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Phaser 3.90 unmodified, type AUTO (WebGL 1)
- [ ] #2 >= 60 fps with 300 moving arcade bodies, p95 <= 16.7 ms, no frame over 50 ms in a 2-minute run
- [ ] #3 sounds audible on macOS, silent headless
- [ ] #4 a T1 test plays a scripted input sequence and checks the score
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. (merge proposed, corrected by the verifier) Not 'only the FPS gate': examples/js-phaser is a star catcher (README) without the Tiled tilemap, sounds/music, gamepad or title/play/game-over scenes the task names, and ZN-578 (PixiJS bunnymark) covers none of Phaser. Rewrite to what is wanted on js-phaser (300 arcade bodies gate, scripted score test) or drop the platformer content explicitly. Evidence: examples/js-phaser, tests/t1/example_js_phaser.sh
<!-- SECTION:NOTES:END -->
