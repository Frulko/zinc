---
id: ZN-578
title: 'FPS gates for the JS-library demos (p5, Pixi, Phaser, three)'
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
ordinal: 14100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** One bench page per library next to the examples/js-* demos (bunnymark with 3,000 sprites and ParticleContainer 20,000, Phaser 300 arcade bodies, three 200 draw calls, p5 500 shapes), run by zbench on quickjs, jsc and v8; p95 and max recorded in each README. Absorbs ZN-577, 579, 580.

examples/games/pixi-bunnies: bunnymark with a spritesheet, a Text counter, pointer to add sprites, and a ParticleContainer mode. Measured today (QuickJS, M1 Pro, offscreen): 4.0 us per sprite, ~4,000 sprites at 60 fps; presentation through the GPU path of ZN-411. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS 8.22 unmodified
- [ ] #2 Container mode >= 60 fps with 3,000 sprites and ParticleContainer mode >= 60 fps with 20,000, p95 <= 20 ms, at 1280x720
- [ ] #3 the measured maximum at 60 fps printed by the demo and recorded in its README
- [ ] #4 the scene matches Chrome at SSIM >= 0.90
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. The four JS-library demos exist as examples/js-p5, js-pixi, js-phaser, js-three with T1 tests. What is left is the FPS gates (bunnymark, 300 bodies, 200 draw calls) with p95 limits, now on three engines (QuickJS, JSC, V8) which changes the numbers. Evidence: examples/js-pixi, tests/t1/example_js_pixi.sh exist (solar system, Pixi 8.22 unmodified)
<!-- SECTION:NOTES:END -->
