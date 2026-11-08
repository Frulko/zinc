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
ordinal: 17200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** One bench page per demo with p95/max printed and recorded in its README: bunnymark 3,000 sprites and ParticleContainer 20,000, Phaser 300 bodies, three 200 draw calls, p5 500 shapes/100 boxes. Run on QuickJS once; JSC/V8 and Chrome SSIM later at a milestone.

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
Review 2026-11-07: merged ZN-577 here (Demo: p5.js sketches (2D and WEBGL, p5 1.11 and 2.x) with FPS gates). ZN-578 already says it absorbs ZN-577, 579 and 580: one FPS-gate task for the js-* demos. Its open criteria: both sketches unchanged from their p5 editor versions; 2D: 500 shapes with text >= 60 fps at 800x600; WEBGL: 100 lit boxes >= 60 fps; screenshots match Chrome at SSIM >= 0.90; a T1 test runs both headless for 120 frames.
Review 2026-11-07: rewrite. The four demos exist; what is left is a gate per demo (and the p5, Phaser, three gates of 577/579/580). Evidence: examples/js-p5, js-pixi, js-phaser, js-three with T1 tests
Review 2026-11-07: merged ZN-579 here (Demo: Phaser 3 platformer with FPS gates). Platformer content is not wanted now; the gate (300 arcade bodies, scripted score test) is ZN-578's. Its open criteria: Phaser 3.90 unmodified, type AUTO (WebGL 1); >= 60 fps with 300 moving arcade bodies, p95 <= 16.7 ms, no frame over 50 ms in a 2-minute run; sounds audible on macOS, silent headless; a T1 test plays a scripted input sequence and checks the score.
Review 2026-11-07: merged ZN-580 here (Demo: three.js game with FPS gates). The arena game is not wanted now; the gate on js-three is ZN-578's. Its open criteria: three.js r186 unmodified; >= 60 fps at 1280x720 with >= 200 draw calls and shadows, p95 <= 16.7 ms; the glTF textures are visible; antialiased edges; a T1 test runs 300 frames headless.
<!-- SECTION:NOTES:END -->
