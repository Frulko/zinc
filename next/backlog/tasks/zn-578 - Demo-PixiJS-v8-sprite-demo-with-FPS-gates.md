---
id: ZN-578
title: 'Demo: PixiJS v8 sprite demo with FPS gates'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-565
  - ZN-566
  - ZN-567
  - ZN-411
  - ZN-568
  - ZN-569
  - ZN-570
ordinal: 357270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/games/pixi-bunnies: bunnymark with a spritesheet, a Text counter, pointer to add sprites, and a ParticleContainer mode. Measured today (QuickJS, M1 Pro, offscreen): 4.0 us per sprite, ~4,000 sprites at 60 fps; presentation through the GPU path of ZN-411. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS 8.22 unmodified
- [ ] #2 Container mode >= 60 fps with 3,000 sprites and ParticleContainer mode >= 60 fps with 20,000, p95 <= 20 ms, at 1280x720
- [ ] #3 the measured maximum at 60 fps printed by the demo and recorded in its README
- [ ] #4 the scene matches Chrome at SSIM >= 0.90
<!-- AC:END -->
