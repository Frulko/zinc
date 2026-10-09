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
ordinal: 358270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/games/phaser-platformer: Tiled tilemap, arcade physics, animated sprites, text, sounds and music, keyboard and gamepad, title/play/game-over scenes. Measured today (QuickJS, M1 Pro): 16 us per arcade sprite, ~1,000 at 60 fps, max frame 84 ms (GC). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Phaser 3.90 unmodified, type AUTO (WebGL 1)
- [ ] #2 >= 60 fps with 300 moving arcade bodies, p95 <= 16.7 ms, no frame over 50 ms in a 2-minute run
- [ ] #3 sounds audible on macOS, silent headless
- [ ] #4 a T1 test plays a scripted input sequence and checks the score
<!-- AC:END -->
