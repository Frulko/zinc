---
id: ZN-572
title: 'Canvas 2D, full tier on the chosen backend'
status: In Progress
assignee: []
created_date: '2026-10-09 08:11'
updated_date: '2026-10-11 18:13'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-571
ordinal: 70000
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel agent (worktree). Backend: canvas_ity stays (decision in the notes of ZN-571). FIRST COMMIT, no criterion ticked yet; HANDOVER below.

DONE (tests/t1/webenv_canvas2d_full.sh, golden tests/golden/webenv/canvas2d/full.out; webenv_canvas2d and webenv_canvas2d_libs still pass against Chrome's frames):
- imageSmoothingEnabled false: drawImage takes the nearest pixel; true: bilinear when the picture is not made smaller (what Chrome does; it was a 16-tap bicubic filter), canvas_ity's filter when it is made smaller; a picture that lands pixel on pixel is copied. Restored by restore().
- A canvas is read back only when something was painted on it: the window's copy (c2d.present) and the copy drawImage and texImage2D take (canvas._pixels, keyed by c2d.stamp).
- Path2D: its own calls, roundRect, SVG path data (M L H V C S Q T A Z, relative forms), addPath with a matrix; fill, stroke, clip and isPointInPath of a path leave the current path alone. The even-odd rule in fill and clip.
- toDataURL and toBlob (PNG with alpha, JPEG over black through src/res/codec.h; any other type is a PNG), OffscreenCanvas (a canvas element outside the document, with convertToBlob).
- ellipse() is one native call (it was five), any clip that leaves the whole canvas visible is no clip (Phaser's camera).
- canvas_ity patches 4 to 6 (third_party/canvas_ity/zinc.patch, the README row): small shapes summed in a grid instead of sorted, shapes without a clip walk their own rows, a plain colour blended span by span; image_smoothing; even_odd.
MEASURED (pairs taken back to back, load 6 to 11, CPU speed limit 35 to 66 %: see ZN-571): p5 1,000 ellipses at 800 x 600 from 5.3 to 3.1 times the time of the same sketch with the painting calls empty; Phaser CANVAS 500 sprites from 11.2 to 4.5 times.

CRITERION 3 (p5 2D, 1,000 filled and stroked ellipses at 60 fps, 800 x 600) CANNOT PASS ON QUICKJS as it is written: with a context whose every method is empty, p5 1.11.13 and QuickJS take 30 to 37 ms for the frame on this (throttled) machine. It waits for the engine of ZN-586, or is to be read as a ratio to that floor. Today: 134 to 164 ms a frame drawn, 44 with the painting calls empty.
CRITERION 1 (WPT subset) not started: no WPT file is in the tree. Next step: pin a commit of web-platform-tests, take html/canvas/element/{path-objects,fill-and-stroke-styles,compositing,drawing-images-to-the-canvas,pixel-manipulation,the-canvas-state,transformations,line-styles,shadows} through tools/test-lib (BSD-3, not vendored: thousands of files), a testharness shim, count pass and fail in a new tests/t2 script.
CRITERION 2 (p5 1.11 and 2.3 examples, Phaser CANVAS at SSIM 0.95): the p5 1.11 page of webenv_canvas2d_libs is at 0.988; p5 2.3 is not in tools/test-lib and was not run; no Phaser CANVAS page has a Chrome reference yet (tools/canvas2d-ref libs makes them: add a phaser-canvas page beside phaser-text.js).
NOT DONE: the 15 blend modes (multiply, screen ... luminosity: a formula on the unpremultiplied colours in the two pixel loops of render_main, next patch), patterns as fillStyle (canvas_ity has set_pattern: createPattern has to hand it the pixels and the repetition), conic gradients, filter, isPointInStroke, the even-odd rule in isPointInPath, shadows were not looked at again.
WHERE THE TIME STILL IS (sample): a sprite costs about 50 ns a pixel at this throttle, through paint_pixel and the general blend for each pixel: a direct loop for a picture that is not rotated is the next gain for Phaser CANVAS; for p5, lines_to_runs and add_runs (the edges of each ellipse, twice: fill and stroke). Phaser's canvas renderer also builds an Error (a stack) every frame somewhere: not looked for.

2026-10-11, second session (worktree agent). STEP 1, drawImage: a picture that is not turned, mirrored or made smaller, drawn source-over with no clip and no shadow, is blended by a loop of its own in draw_image (canvas_ity patch 7): no copy of the picture as a brush, no runs, no paint_pixel; nearest or bilinear as before, edge pixels by coverage. Also: c2d.image no longer throws and catches an exception for each call (JS_GetArrayBuffer of a typed array built an Error with its stack: the Error the first handover saw), and drawImage checks its eight numbers with one sum. Test: the 'sprites' line of full.js (the loop against the general way under a clip, smoothed and nearest, within 1). MEASURED, 4 pairs back to back, load 7.5 to 7.9, CPU speed limit 46 to 48 %, 800 x 600, ms a frame: 500 drawImage of a 32 x 32 canvas at fractional places 39.3-44.7 -> 13.3-19.5 (2.1 with drawImage empty); Phaser 3.90 type CANVAS, 500 images, 68.4-84.6 -> 37.6-45.6 (24.1-30.5 with drawImage empty): 2.8 -> 1.5 times its floor. What is left in the loop: a row of the picture is converted to float colours for each row drawn (half the time with the nearest pixel).
<!-- SECTION:NOTES:END -->
