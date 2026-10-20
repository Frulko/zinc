---
id: ZN-570
title: 'Canvas 2D, text-first tier'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-11 15:08'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-568
  - ZN-569
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A CanvasRenderingContext2D for QuickJS on a CPU RGBA8 premultiplied bitmap, enough for the text of WebGL games (PixiJS Text, Phaser Text, Kaplay's font atlas, LittleJS overlay, Babylon font offsets) and the libraries' boot-time canvas probes: state stack, transforms, fillRect/clearRect/strokeRect, drawImage with 3/5/9 arguments, getImageData/putImageData/createImageData, fillText/strokeText/measureText with the full TextMetrics through the HarfBuzz/stb_truetype text tier, font parsing, textAlign/textBaseline/direction/letterSpacing, solid and gradient fills, text shadows; texImage2D(canvas). Loaded as an on-demand module (libzn_canvas2d) like libzn_webgl. zinc:canvas (typed, software raster) stays for typed apps: its deviations (no alpha in runtime images, bbox clip, no composite ops, no getImageData) rule it out for JS libraries. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS Text, Phaser Text, Kaplay text() and LittleJS overlay text match headless Chrome at SSIM >= 0.90, glyph boxes within 1 px
- [x] #2 measureText('Hello').width within 1% of Chrome for the bundled sans font
- [x] #3 unsupported calls are recorded no-ops (debug counter), not exceptions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 09:10, parallel agent (worktree). NOT STARTED: no code, and NO DECISION on the backend. What follows is the reading done before a pause, so that it is not done twice. The scores are estimates to be redone once the two measures named below exist.

FACTS FOUND (each with where it is written):
- The engine's own 2D cannot give a JavaScript library its canvas without work in the shared rasterizer: a render target is opaque ("0xAARRGGBB with straight alpha once dyn_set_alpha says so (decoded sprites; a render target is opaque again)", runtime/zrt_raster.h line 45), and no host row reads an image's pixels back (the image rows of next/include/zn/runtime.h are Image, ImageWidth, ImageHeight, DrawImage, CreateImage, DestroyImage, BeginImage, EndImage, DrawImageRect, ImageFromBytes). A text canvas of PixiJS or Phaser is transparent around its glyphs and is uploaded or read with getImageData. plugins/canvas2d (typed Zinc, 722 lines, docs/plugins/canvas2d.md) also says: text not rotated, strokeText fills the glyphs, clip to the bounding box, no composite operation, no getImageData.
- The text tier is already in the zinc binary and is a small interface of ours over proven libraries: next/src/text/layout.h (Face::open, ascent, descent; layout() shapes with HarfBuzz, SheenBidi, libunibreak, with a fallback chain; rasterize() gives a glyph's 8-bit coverage through stb_truetype). zinc links zn_text_gfx, which links zn_text. It has no entry for a glyph's outline yet (stb_truetype has stbtt_GetGlyphShape).
- The bundled fonts are lib/fonts/Inter-Regular.ttf (sans), Inter-Bold.ttf, JetBrainsMono-Regular.ttf, with their licences; the web environment is given lib/std, so they are at stdRoot/../fonts.
- A candidate library, canvas_ity (github.com/a-e-k/canvas_ity, ISC, one header of 3,469 lines, commit 8be29cb154d06392385687c721f822d8cce0dc05 of 2024-02-29, sha256 of src/canvas_ity.hpp 7b69c4678495adf119f281aa4f4935d06a9bed5820fde85bfcdcdf85d9256b6c; fetched to read, NOT vendored). Its own header says: modelled on the W3C 2D canvas specification, "could produce a conforming HTML5 2D canvas implementation if wrapped in a thin layer of JavaScript bindings"; under 36 KiB of object code; transforms, global alpha, 11 compositing operations, shadows with blur, line styles and dashes, linear and radial gradients, patterns, paths, fill, stroke, clip, rectangles, draw_image, get and put_image_data, save and restore. And its stated limits: blending is gamma-correct with ordered dithering and bicubic resampling (a browser does none of the three, so pixels will differ from Chrome on edges, gradients and scaled images); fill() has no even-odd rule; text is "extremely basic" (left to right, no kerning, shaping or layout: "feed the results to this library as either placed glyphs or raw paths"); "TRUETYPE FONT PARSING IS NOT SECURE"; no check for non-finite numbers; single-threaded, "if you need the speed, you are better off using a more fully-featured library".
- stb_truetype says of itself that it is not for untrusted fonts either, so a FontFace should take files of the project only (which is also all HostGfxLoadFont takes).
- Chrome is on the development Mac (/Applications/Google Chrome.app) and next/tools/cdp.py drives it headless: reference frames can be made once and stored, as tests/three/ref is.

OPTIONS AND A FIRST SCORING (RULES 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1). Performance and the fit of (D) are GUESSES until measured.
(A) the engine's own 2D (zinc:gfx rows, the shared rasterizer, plugins/canvas2d): 1,3,5,2,5,5,1 = 42. Fails on alpha and read-back, both in runtime/.
(B) canvas_ity alone, with its own text: 2,3,5,4,5,5,4 = 52. No kerning or shaping (criterion 2 asks for 1 % of Chrome), an unsafe font parser.
(C) a compositor of our own on an RGBA8 premultiplied bitmap (rectangles, blits, glyph coverage, gradients, a box blur) with the text tier: 3,5,5,3,5,5,3 = 58. What the games report recommends for this tier. No paths (p5's rect() is a path fill and stroke), strokeText only as a dilated mask, and a second backend later for ZN-572.
(D) canvas_ity for everything drawn, the text tier for shaping and metrics, glyph outlines given to it as paths: 4,3,5,4,5,5,4 = 58. Real strokeText, shadows, gradients on text, rotated text, paths and clip, one backend for this task and most of ZN-572; no W3C blend mode beyond its 11 operations, no nearest-neighbour image sampling.
(E) Skia: 5,5,1,2,5,3,1 = 50 (ZN-572's spike).
(C) and (D) tie; on a tie RULES takes fewer moving parts, which is (D) (one vendored header against raster code of our own plus a later second backend). TWO MEASURES DECIDE IT and neither exists: (1) canvas_ity's time for a line of text into 512 x 128 and for a 640 x 480 fill (a scratch program was written and never ran: the machine was at a load of 80); if a line of text costs more than a few milliseconds, (C). (2) SSIM against Chrome for a text canvas, given the gamma-correct blending and the dithering; if under 0.90, (C).

A PLAN FOR THE SLICES, if (D) holds (each with a test and a commit): 1 the bitmap, state, transforms, fillRect / clearRect / strokeRect, getImageData / putImageData / createImageData, a canvas as a texture source (replacing context2d() and HTMLCanvasElement._pixels() in lib/std/webenv.js), with pixel checks against flat colours; 2 drawImage in its 3, 5 and 9 argument forms from an image, a canvas and an ImageData; 3 font parsing, measureText with the whole TextMetrics, fillText with textAlign, textBaseline, direction and letterSpacing, against Chrome with Inter loaded in both; FontFace and document.fonts for files of the project go here; 4 strokeText, gradients, text shadows; 5 the libraries: PixiJS Text, Phaser Text, PixiJS 7's Graphics fill, p5's 2D mode. Unsupported calls counted, not thrown (criterion 3).

2026-10-11 17:15, parallel agent (worktree), second session. DECISION TO RECORD (no number taken here: the coordinator writes it in zinc-next-decisions.md): the backend of this tier is (D), canvas_ity for everything drawn with the engine's text tier for shaping and metrics, glyph outlines given to it as paths.
THE TWO MEASURES (scratch program, canvas_ity at commit 8be29cb, -O2, Inter, this Mac at a load of 8): (1) one line of 34 characters at 28 px into 512 x 128: 1.3 ms (0.95 ms once patched); with a blurred shadow 3.6 ms; a 640 x 480 fill 4 to 5 ms. Under the few milliseconds that would have sent us to (C). (2) SSIM against headless Chrome for a text canvas of 512 x 128 (32 px and 16 px Inter): 0.963 white on transparent, 0.963 black on white as upstream, 0.976 black on white once blended in sRGB. Over the 0.90 that would have sent us to (C).
A THIRD MEASURE CHANGED THE LIBRARY, NOT THE CHOICE: get_image_data of 640 x 480 costs 27 ms upstream (two powf per channel: the bitmap is linear light) and 1.7 ms with colours kept as sRGB values, which is also what a browser's canvas does (half transparent white over black is 128, not 188). So the header carries three small patches, kept as third_party/canvas_ity/zinc.patch and marked in the header: 1 sRGB blending, 2 exchange_path() (fillText must not change the current path, and the path is private), 3 pixels read back rounded, not dithered (a flat half transparent colour read back as one value).
SCORES REDONE WITH THE MEASURES (fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1): (A) own 2D 1,3,5,2,5,5,1 = 42; (B) canvas_ity with its own text 2,4,5,4,5,5,4 = 55; (C) own compositor with the text tier 3,5,5,3,5,5,3 = 58; (D) canvas_ity with the text tier 5,4,5,4,5,5,4 = 64; (E) Skia 5,5,1,2,5,3,1 = 50. (D) rises on fit (text equals Chrome's numbers, see below; strokes, shadows, gradients and transforms on text for free; paths for p5) and on performance (measured, no longer a guess). What would make us revisit: a p5 sketch that fills the screen many times a frame (4 to 5 ms per 640 x 480 fill is the ceiling of a float RGBA bitmap on one thread), or ZN-571 choosing a GPU backend for the full tier.
SECOND DECISION TO RECORD: linked into zinc (zn_qjs), not a module libzn_canvas2d as the description says. The object is 99 KB of code and zinc grows by 94 KB (13,782,280 to 13,875,824 bytes, 0.7 %); the text tier it needs is already in zinc; a module would add a dlopen, an exported interface and a second copy of nothing. libzn_webgl is a module because of glslang and glad (megabytes). Reversible: one CMake target.
DONE IN THIS COMMIT: src/qjs/canvas2d.cpp (native.c2d: bitmap, numeric calls, text and measure through src/text, fonts, read, write, image, present), text::outline in src/text, the CanvasRenderingContext2D, CanvasGradient, TextMetrics, FontFace and document.fonts of lib/std/webenv.js, a 2D canvas shown in the window and as a texture source, tools/canvas2d-ref, tests/t1/webenv_canvas2d.sh. Against Chrome with the same font: measureText('Hello') at 32 px 77.125 on both sides (criterion 2: equal, not within 1 %); 23 entries of metrics, baselines, alignments and glyph boxes within a pixel; the scene of game text SSIM 0.989.

2026-10-11 17:50, same agent, HANDOVER. Three commits on the branch: the context and its test; the libraries against Chrome; a 2D canvas shown with its alpha (an overlay over a WebGL canvas).
CRITERION 2 ticked: measureText('Hello').width at 32 px is 77.125 in headless Chrome and here, 24.102 and 24.102 at 10 px (tests/t1/webenv_canvas2d.sh, chrome.json: 23 entries of widths, TextMetrics, baselines, alignments and glyph boxes, none differs by more than a pixel, widths by 1 %).
CRITERION 3 ticked: Path2D arguments, patterns, conic gradients, filters, the even-odd rule, blend modes beyond the eleven, isPointInStroke are counted (__canvas2dUnsupported(), named by ZINC_WEB=trace) and throw nothing; a number that is not finite makes a call do nothing (the 'unsupported' line of text.out). Known gap, left for ZN-572: there is no Path2D class, so 'new Path2D()' is a ReferenceError as in a browser without it; a class that draws nothing would make a library that tests for it choose the path that shows nothing.
CRITERION 1 LEFT OPEN, half proven: PixiJS 8 Text SSIM 0.9755, Phaser 3 Text 0.9838, a p5 sketch in 2D mode 0.9880, the scene of game text 0.9889 against headless Chrome with the same font (tests/t1/webenv_canvas2d_libs.sh and webenv_canvas2d.sh; references by tools/canvas2d-ref); glyph boxes within a pixel (chrome.json). NOT PROVEN: Kaplay text() and LittleJS overlay text with the libraries themselves. Neither library is in the repository or in tools/test-lib, and neither was tried. What they need from this tier is there and tested without them: fillText, strokeText and measureText on a canvas used as a texture (Kaplay's atlas), and a transparent 2D canvas over the WebGL one (LittleJS's overlay: overlay.js). NEXT STEP for whoever takes the task: add kaplay and littlejs (both MIT) to tools/test-lib or third_party with their pins, a page each under tests/golden/webenv/canvas2d/libs, a line each in tools/canvas2d-ref libs and in webenv_canvas2d_libs.sh; then 'tools/canvas2d-ref libs kaplay littlejs' and 'tests/run --tier t1 --only webenv_canvas2d_libs'. Both libraries may ask for an AudioContext at start (ZN-573), not checked.
ALSO DONE: roundRect with circular corners (p5 calls it), ellipse, FontFace and document.fonts for the program's own files (a font from the network is refused; bytes that are not a font file are refused before stb_truetype reads them), PixiJS 7 Graphics fill and Text seen in a frame (no test).
NOT DONE, NOT IN THIS TIER: nearest-neighbour drawImage (imageSmoothingEnabled is kept and ignored: always bicubic), italic and bold synthesis, a bold monospaced face, toDataURL. The three example READMEs say Text is now possible; the examples themselves are unchanged (ZN-577 to ZN-579).
LINES FOR later.md (the coordinator adds them): see the final report.
<!-- SECTION:NOTES:END -->
