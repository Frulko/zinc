---
id: ZN-577
title: 'Demo: p5.js sketches (2D and WEBGL, p5 1.11 and 2.x) with FPS gates'
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
  - ZN-568
  - ZN-569
  - ZN-572
ordinal: 10300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** ZN-578 is a PixiJS v8 bunnymark task; it does not cover p5. examples/js-p5 has a WEBGL and a 2D sketch on p5 1.11 only: no p5 2.x switch, no 500-shapes/100-boxes 60 fps gate, no Chrome SSIM. Rewrite this task to the gates on the existing demo instead of folding four libraries into one Pixi task.

examples/games/p5-sketches: a 2D sketch (shapes, text, image, mouse, pixels[]) and a WEBGL sketch (lit boxes, texture, orbitControl), switchable between p5 1.11 and 2.3 by the import map. Measured today (QuickJS, M1 Pro): p5 1.11 WEBGL ~100 us per box (12 GL calls each), p5 2.3 ~130 us; 2D JS cost 9-34 us per shape before rasterization. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 both sketches unchanged from their p5 editor versions
- [ ] #2 2D: 500 shapes with text >= 60 fps at 800x600
- [ ] #3 WEBGL: 100 lit boxes >= 60 fps
- [ ] #4 screenshots match Chrome at SSIM >= 0.90
- [ ] #5 a T1 test runs both headless for 120 frames
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. (merge proposed, corrected by the verifier) ZN-578 is a PixiJS v8 bunnymark task; it does not cover p5. examples/js-p5 has a WEBGL and a 2D sketch on p5 1.11 only: no p5 2.x switch, no 500-shapes/100-boxes 60 fps gate, no Chrome SSIM. Rewrite this task to the gates on the existing demo instead of folding four libraries into one Pixi task. Evidence: examples/js-p5 (WEBGL), tests/t1/example_js_p5.sh
<!-- SECTION:NOTES:END -->
