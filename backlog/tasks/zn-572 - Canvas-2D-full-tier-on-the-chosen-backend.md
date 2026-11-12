---
id: ZN-572
title: 'Canvas 2D full tier: WPT subset and p5 2.3'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
updated_date: '2026-11-12 04:56'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies: []
ordinal: 18900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Replace the WPT 80% criterion by a small pinned WPT subset run in seconds; p5 2.3 2D examples SSIM >= 0.95 on one engine; list the full WPT run for a milestone.

**What is left (review 2026-10-25):** Keep the done list. Remaining criteria: WPT html/canvas/element subset at 80 percent; p5 2.3 2D examples at SSIM 0.95; the fps criterion measured on the jsc/v8 engines instead of QuickJS. Already there: tests/t1 webenv_canvas2d_full.sh, webenv_canvas2d_libs.sh, example_js_p5.sh; handover in the task notes.

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

STEP 2, blend modes and patterns: the 15 blend modes (canvas_ity patch 8: blend_mode, the source mixed with the pixel under it then drawn source-over, in the two pixel loops of render_main; a plain colour and a sprite under a blend mode take the general loops), so the 26 values of globalCompositeOperation; a value that is not one is ignored, as in a browser. createPattern (a picture, a canvas; the four repetitions; null for a picture not loaded; SyntaxError for a wrong repetition) as fillStyle and strokeStyle through canvas_ity's set_pattern (c2d.pattern). Test: tests/golden/webenv/canvas2d/modes.js, its lines against headless Chrome's for the same script (modes-chrome.out, made by the new 'tools/canvas2d-ref out modes'), each number within 2: all 15 modes are within 1 of Chrome, the patterns exact. Left as it is: CanvasPattern.setTransform (counted, does nothing), a pattern under a scale is filtered over 16 pixels (bicubic) where Chrome takes 4, a shadow under a blend mode is not blended.

STEP 3: conic gradients (createConicGradient; canvas_ity patch 9: set_conic_gradient, the colours by the angle around the point), isPointInStroke (the current path or a Path2D, with the width, caps, joins and dashes of the moment: is_point_in_path on the outline of the stroke) and isPointInPath by the even-odd rule. Test: three more lines of modes.js against Chrome (conic within 1, the hit tests the same). filter is NOT done: no criterion asks for it; it stays counted by __canvas2dUnsupported().

CRITERION 2, the Phaser part: a Phaser 3.90 type CANVAS page (libs/phaser-canvas.js: sprites on whole and half pixels, scaled, turned, half transparent, ADD, MULTIPLY and SCREEN, shapes, a text) is at SSIM 0.9948 against headless Chrome (libs/phasercanvas-chrome.png, 'tools/canvas2d-ref libs phasercanvas'); webenv_canvas2d_libs asks 0.97. Found there: Phaser probes the blend modes with two data: pictures loaded one after the other when its script runs and reads the answer when the game starts; here the next script element runs between the two pictures, so a game added right after Phaser draws MULTIPLY and SCREEN source-over (SSIM 0.952). The test page adds the game a few turns later; the order of script elements and picture loads is the web environment's (line for later.md in the report).

HANDOVER (2026-10-11, end of the second session). Back in Backlog, no criterion ticked. DONE this session: steps 1 to 3 above and the Phaser CANVAS page, four commits. All of: shared_headers webenv webenv_canvas webenv_canvas2d webenv_canvas2d_full webenv_canvas2d_libs webenv_pixi webenv_phaser webenv_p5 example_js_pixi example_js_phaser example_js_p5 pass. The description's list is covered but for filter (CSS filter subset: not done, no criterion asks) and imageSmoothingQuality (kept, changes nothing).
OPEN: #1 WPT subset: not started, as the first handover says (pin a commit, tools/test-lib, a testharness shim, a tests/t2 script). #2: p5 1.11 at 0.988 and Phaser CANVAS at 0.995 are there; p5 2.3 is not in tools/test-lib and was not run: add it there, a p5-2 page beside libs/p5.js, its Chrome frame. #3 (60 fps for 1,000 ellipses) cannot pass on QuickJS as written (first handover): unchanged, not measured again.
NEXT COMMAND: tools/test-lib (add p5 2.3), then 'tools/canvas2d-ref libs p5v2' with a new page; for #1 the plan of the first handover.
Review 2026-10-25: done-partly. Steps 1 to 3 plus Phaser CANVAS and p5 1.11 (0.988) match Chrome. Left: WPT canvas subset at 80 percent, p5 2.3 reference, and the 60 fps / 1,000 ellipses criterion the notes say cannot pass on QuickJS (move it to the JSC/V8 engines or drop). Evidence: tests/t1 webenv_canvas2d_full.sh, webenv_canvas2d_libs.sh, example_js_p5.sh; handover in the task notes
Review 2026-11-07: done-partly. Full tier is largely built; WPT 80% sweep, p5 2.3 SSIM and fps gate remain. Evidence: tests/t1/webenv_canvas2d_full.sh; webenv_canvas2d_libs.sh; example_js_p5.sh


2026-11-12 — software-only WPT seed/tooling increment, work/572-canvas-wpt, true reset base f4b9ace31d2f4ec173b4ea453521be97711a6867. All three AC remain OPEN; no conformance score, SSIM or FPS result is claimed.

Read delegated primary research `.logs/research-canvas-h.txt`. Upstream [WPT](https://github.com/web-platform-tests/wpt/tree/0e3495aa72373a19ef8ba9ba2b28fdb52ff6ffb5), [testharness documentation](https://web-platform-tests.org/writing-tests/testharness.html), [API](https://web-platform-tests.org/writing-tests/testharness-api.html) and canvas helper informed the narrow adapter. Five cases were fixed before any execution: scale, translate, fillStyle save/restore, default fillStyle and createImageData. `third_party/wpt-canvas` retains their byte-identical HTML, full unchanged canvas-tests.js helper, BSD-3-Clause LICENSE, exact revision and per-file SHA256 manifest; README and third-party row document the limited coverage. No build dependency or downloader. Existing tools/test-lib already has p5 2.3.4; the older handover's missing-version statement is stale.

`tools/canvas-wpt` validates the immutable revision/list/denominator and every upstream hash, extracts the exact inline callbacks through stdlib HTMLParser, and rejects unexpected dependencies/structure. It supplies strict test assertions and only the synchronous upstream _addTest load lifecycle; it does not implement or replace any Canvas API. Missing/duplicate/malformed result, zero tests, missing completion, exception, unsupported API or failed process cannot pass. The real command is serial QuickJS/headless, 10 seconds and 64 KiB output per case, with owned process-group termination/reaping. Generated scripts, per-case errors and summary remain in a new owned evidence directory; all five cases retain their denominator even on launch/extraction failure. Exit success requires >=4/5, the existing 80% AC threshold, not broad WPT coverage.

Proof is PURE tool validation only: `.logs/t0-first.log`, `.logs/t0-final.log` and `.logs/t0-after-review.log` and `.logs/t0-hard-output-bound-2.log` record exact T0 canvas_wpt_tool PASS, using only synthetic Node callbacks and a fake pixel context. Actual upstream callbacks were extracted/compared but NEVER executed. Negative synthetic checks cover false equality and pixel assertions, missing done, unsupported promise_test, exception, double completion, zero tests, malformed/duplicate results, changed pin/hash/list and denominator; synthetic runaway/output cases prove deadline/output-group cleanup and an on-disk log no larger than 64 KiB. Coordinator review found the first polling-file approach could overshoot that byte cap; the final pipe reader writes at most the cap and retains an explicit limit error, without limiting unrelated engine cache files. The first pipe check exposed a Darwin EPERM when killing a completed, unreaped group at EOF; bounded parent wait/reap before group cleanup corrected it. That failed T0 log and its exact source snapshot are retained. Real Canvas, WPT, Zinc engines, p5/Phaser frames and performance were NOT run. No engine build, owner-held source change, SDK/OS/service action or owned process remains. No user-visible engine change, therefore no changelog entry.

Next command when owner-selected: `/absolute/main/tools/work-run 60 tools/canvas-wpt --zinc /absolute/clean/build/zinc`. Its runtime compatibility and actual Canvas results are still unproven; an engine gap must be fixed in the engine, never hidden by adapting a test. This seed is a starting subset, not completion of the broader Canvas criterion.

Proposed decision (no D number): retain a few immutable upstream cases and the helper locally, preserving callback bodies and numerical assertions; use the existing QuickJS web facade with a small explicit lifecycle adapter instead of downloading all WPT or replacing Canvas semantics. No new library. No measured performance or memory number. Usage: n/a.

Proposed tests:
- Owner-selected bounded `tools/canvas-wpt --zinc <clean-zinc>`: actual five-case Canvas result, <=50 seconds plus setup/cleanup, memory unmeasured; currently UNRUN.
- Owner-selected p5 2.3.4/1.11 and Phaser CANVAS Chrome SSIM comparison, then separate quiet JSC/V8 ellipse FPS gate; existing tools/test-lib and canvas2d-ref, duration/memory unmeasured. Full WPT only at a separately selected milestone.

<!-- SECTION:NOTES:END -->
