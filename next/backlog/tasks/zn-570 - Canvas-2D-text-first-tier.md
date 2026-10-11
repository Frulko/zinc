---
id: ZN-570
title: 'Canvas 2D, text-first tier'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
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
- [ ] #2 measureText('Hello').width within 1% of Chrome for the bundled sans font
- [ ] #3 unsupported calls are recorded no-ops (debug counter), not exceptions
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
<!-- SECTION:NOTES:END -->
