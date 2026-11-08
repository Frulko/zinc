---
id: ZN-1042
title: Canvas 2D fidelity and speed for p5 and Phaser sketches
status: Backlog
assignee: []
created_date: '2026-11-07 16:38'
labels:
  - canvas
  - perf
  - size-M
milestone: m-8
dependencies: []
ordinal: 1034000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
canvas2d gaps and costs seen with the JS libraries.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-570: showing a 2D canvas reads the whole bitmap back every frame (1.7 ms at 640 x 480); a dirty flag in `canvas2d.cpp` would skip unchanged frames.
- ZN-570: `drawImage` is always bicubic; pixel-art games need nearest-neighbour when `imageSmoothingEnabled` is false.
- ZN-570: no `Path2D`, no italic or bold synthesis, no bold monospaced face, no `toDataURL` (ZN-572).
- ZN-572: a direct loop for an unrotated `drawImage`; a sprite still goes through `paint_pixel` and the general blend for each pixel (Phaser CANVAS is 4.5 times its floor).
- ZN-572: web environment: a script element added right after Phaser runs between the two data: pictures of Phaser's blend-mode probe, so a CANVAS game draws MULTIPLY and SCREEN source-over; settle picture loads before the next script element runs.
- ZN-572: the direct drawImage loop converts a row of the picture to float colours for every row drawn (half the time with the nearest pixel); keep converted pictures by stamp, or blend from bytes.
- ZN-572: a pattern under a scale is filtered over 16 pixels where Chrome takes 4; CanvasPattern.setTransform does nothing; the CSS filter subset; a shadow under a blend mode is not blended; a sprite under a blend mode or a clip takes the general loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 imageSmoothingEnabled=false draws nearest-neighbour; Path2D exists; drawImage direct loop for unrotated images keeps converted rows
- [ ] #2 Showing a 2D canvas skips an unchanged frame (dirty flag)
- [ ] #3 Pattern under scale filters like Chrome; setTransform works
- [ ] #4 Phaser CANVAS blend modes survive picture load order in the web env
<!-- AC:END -->
