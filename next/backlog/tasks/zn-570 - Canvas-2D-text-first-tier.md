---
id: ZN-570
title: 'Canvas 2D, text-first tier'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-568
  - ZN-569
ordinal: 349270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A CanvasRenderingContext2D for QuickJS on a CPU RGBA8 premultiplied bitmap, enough for the text of WebGL games (PixiJS Text, Phaser Text, Kaplay's font atlas, LittleJS overlay, Babylon font offsets) and the libraries' boot-time canvas probes: state stack, transforms, fillRect/clearRect/strokeRect, drawImage with 3/5/9 arguments, getImageData/putImageData/createImageData, fillText/strokeText/measureText with the full TextMetrics through the HarfBuzz/stb_truetype text tier, font parsing, textAlign/textBaseline/direction/letterSpacing, solid and gradient fills, text shadows; texImage2D(canvas). Loaded as an on-demand module (libzn_canvas2d) like libzn_webgl. zinc:canvas (typed, software raster) stays for typed apps: its deviations (no alpha in runtime images, bbox clip, no composite ops, no getImageData) rule it out for JS libraries. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS Text, Phaser Text, Kaplay text() and LittleJS overlay text match headless Chrome at SSIM >= 0.90, glyph boxes within 1 px
- [ ] #2 measureText('Hello').width within 1% of Chrome for the bundled sans font
- [ ] #3 unsupported calls are recorded no-ops (debug counter), not exceptions
<!-- AC:END -->
