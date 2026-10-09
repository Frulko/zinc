---
id: ZN-572
title: 'Canvas 2D, full tier on the chosen backend'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-571
ordinal: 351270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the backend chosen by JSG-08, behind the same JS facade as the text-first tier: paths, arcs, ellipses, bezier, roundRect, Path2D (+ SVG path strings; every p5 2.x shape goes through Path2D), clip with arbitrary paths, all 26 globalCompositeOperation values, shadows, patterns, conic gradients, filter (CSS filter subset), imageSmoothingEnabled/Quality, isPointInPath/isPointInStroke, OffscreenCanvas, toDataURL/toBlob. Needed by p5 P2D, Phaser's CANVAS renderer, PixiJS v8's Canvas renderer and matter-js Render. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a pinned WPT html/canvas/element subset passes at >= 80%
- [ ] #2 p5.js 1.11 and 2.3 2D examples and Phaser 3 type CANVAS match Chrome at SSIM >= 0.95
- [ ] #3 p5 2D, 1,000 filled and stroked ellipses >= 60 fps at 800x600
<!-- AC:END -->
