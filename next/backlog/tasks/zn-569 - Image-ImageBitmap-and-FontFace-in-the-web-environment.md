---
id: ZN-569
title: 'Image, ImageBitmap and FontFace in the web environment'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-11 01:45'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Image.src (files, data/blob URLs, http through zinc:net) and createImageBitmap decode PNG, JPEG and WebP off the main thread with the vendored stb_image and libwebp (decision D34); texImage2D from them honours UNPACK_FLIP_Y_WEBGL, UNPACK_PREMULTIPLY_ALPHA_WEBGL and UNPACK_COLORSPACE_CONVERSION_WEBGL, and createImageBitmap applies imageOrientation/premultiplyAlpha itself; FontFace.load registers TTF/OTF with the text tier; document.fonts. Closes the known gap of examples/webgl-studio (GLTFLoader decodes textures through createImageBitmap). Related: ZN-432 adds imageFromBytes to zinc:gfx and the thread-pool decoding plan of docs/reports/games/toolchain-assets-loading.md; share the decoder entry points. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the Cesium Milk Truck in examples/webgl-studio shows its texture
- [ ] #2 PixiJS Assets.load('bunny.png') and Phaser this.load.image upload real pixels (pixel check of one sprite)
- [ ] #3 the WebGL conformance texture pages that need images run (count reported)
- [ ] #4 decoding a 4096x4096 PNG never blocks a frame for more than 2 ms
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel agent (worktree), Intel Mac. In progress. These notes are in the order of the work: STEP 2 takes back the bitmaps STEP 1 describes (createImageBitmap is NOT in the environment); read the last "STATE OF THE CRITERIA" for where the task stands.

STEP 1, images and bitmaps (done, tested).
- Decoding is the engine's codec and nothing of our own: zn::res::decodeRgba (src/res/res.cpp: stb_image for PNG, JPEG, BMP and a GIF's first frame, libwebp for WebP), reached by one native of the environment, decodeImage (src/qjs/webenv.cpp). The pixels go to JavaScript as the decoder's own buffer, handed over, not copied (an ArrayBuffer over the std::vector, with QuickJS's memory callback).
- A bound at the door, because the bytes may come from a network: a picture of more than 2^26 pixels (8192 x 8192, 256 MiB of RGBA) is refused from its header, before a pixel is allocated, with the reason on stderr and the element's error event. For that the codec gained imageSize (src/res/codec.h: stbi_info_from_memory, WebPGetInfo). Measured: a file of 57 bytes whose header asks for 9000 x 9000 pixels is refused with "zinc: an image of 9000 x 9000 pixels is larger than the 67108864 the web environment decodes" and the whole run peaks at 14.6 MB. (What the decoder would reserve without the bound, some hundreds of MiB, is read from its code, not measured.) The decoder has a limit of its own above ours, 2^28 pixels, which answers "not an image". One constant for every program (marked in the code).
- HTMLImageElement / Image (lib/std/webenv.js): src is loaded as fetch loads it (the project's files through the host's file row, so permissions hold; data: and blob: URLs; http through zinc:net), then decoded. In the order a browser gives: `complete` is false as soon as src is set and still false after the microtasks; then, in a task of its own, the natural size, `complete` and `load` together, or `complete` with no size and `error`. A src set again abandons the load before it (one event, for the last). decode() settles with the load (EncodingError for no picture). width and height are the attributes, else the natural size; src reads back resolved, as in a browser.
- ImageBitmap and createImageBitmap(source[, sx, sy, sw, sh][, options]) from a Blob, an image element, an ImageData, a canvas or a bitmap. A bitmap keeps its pixels as decoded with two flags (imageOrientation 'flipY'; premultiplyAlpha 'none', else premultiplied), and the WebGL binding applies them as it uploads, in place of UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL, which WebGL ignores for a bitmap: making a bitmap costs no pass over the pixels. A rectangle that leaves the source is transparent there. NOT done: resizeWidth / resizeHeight (the promise is rejected by name, NotSupportedError, rather than answered with a bitmap of another size).
- As a texture source (src/gl/webgl_js.cpp domPixels): an element or a bitmap is read through its _pixels(); a source may carry its own flipY and premultiply. RGBA / UNSIGNED_BYTE, what nearly every upload asks for, now copies rows, or premultiplies in integers, instead of going through floats a pixel at a time: the same bytes (checked for each of the 65,536 colour and alpha pairs against the float path, at -O0 and -O2, 0 differ).

DECISION, criterion 4 is NOT met and is not attempted in this task: decoding stays on the main thread. Measured first (release build, real clock, load 2.6 to 3.3, a 4096 x 4096 PNG of 39.8 MiB with a pattern that compresses to 65 %, and the same at 1024 x 1024, 2.7 MiB):
  reading the file through fetch: 307 ms (1024: 36 ms); decoding: 415 ms (34 ms); Image.src to load: 525 ms (50 ms); the longest time between two frames meanwhile: 525 ms (50 ms). The criterion asks for 2 ms.
  Where the time is: the decode, and as much again before and after it. The file row alone, measured apart (await fetch(file), three times, load 3.7): 252, 211 and 187 ms for the 39.8 MiB, where one copy of the same bytes in JavaScript takes 9 ms. By its code (next/src/host/sys_host.cpp readAll and ret) it fills a vector through a byte iterator (out.assign(std::istreambuf_iterator...)), then copies it into a string and that into another, before our own copy into an ArrayBuffer; which of these is the cost was not measured line by line. (The 307 ms above is the first read of that run and includes what a first fetch pays.) And a 4096 x 4096 upload was 115 ms (see below).
  Options scored (RULES 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1):
  (a) read and decode in the host, on libuv's loop and thread pool, permission-checked there, the result handed to QuickJS as an owned buffer: 5,5,5,4,5,4,2 = 64. It is the plan of docs/reports/games/toolchain-assets-loading.md (6.4, G09). It needs new host rows (next/include/zn/runtime.h, next/src/host), files other sessions hold tonight.
  (c) decode on the main thread: 2,2,5,5,5,5,5 = 52.
  (b) a worker thread of the web environment's own that decodes only: 2,3,5,3,5,4,4 = 49. Scored 58 before the measure, when it was thought to meet the criterion. It does not: the file read cannot move to a thread of ours without leaving the host's permission checks, so 110 to 307 ms stay on the main thread, and the mechanism would be a second one beside (a).
  CHOICE: (c) now, (a) as the follow-up task below.

MEASURED, the upload (texImage2D + gl.finish from an image element, median of 7 a run; the float loop against the new path, alternated on one zinc binary, load 5.5): 1024 x 1024 as decoded 14.9, 9.5, 7.5 ms before and 1.6, 1.1, 1.1 ms after; premultiplied 16.4, 8.3, 7.6 ms before and 3.6, 3.3, 3.3 ms after. 4096 x 4096 as decoded 114.9, 114.6 ms before and 26.4, 28.9 ms after; premultiplied 119.3, 117.6 ms before and 52.8, 53.7 ms after. What remains at 4096 x 4096 is a zero fill and one copy of 64 MiB before the driver's own; not removed.

LIBRARY, Phaser 3.90.0: BOOTS unmodified to its frames and shows a picture from a file (PASS webenv_phaser). Its default textures decode (data: PNGs), its loader brings tests/data/images/fixture.png (XMLHttpRequest of a blob, a blob: URL, an image element), and the pixels read back after its render at frames 2 and 8 are the file's own colours (220,30,30 / 60,60,20 / 255,255,255), the rectangle's 255,0,0 and the background's 16,32,48; a scripted key reaches its keyboard (the left cursor key is up at frame 5 and down at frame 7) and a scripted button its pointer ("pointerdown 100 60"). Vendored as test data: next/third_party/phaser (MIT; phaser.min.js of the npm release, the tarball's sha1 and sha512 equal to the registry's record, sha256 in PIN). A page that reads the drawing buffer must do it in Phaser's postrender event: its context does not preserve the buffer, and a later task reads zeros, as in a browser (the first version of the page read in update() and got 0,0,0,0).

TESTS: tests/t0/webenv.sh gains tests/golden/webenv/image.js (23 lines: the order of the events, each format's size, data: and blob: URLs, what is no picture, the pixel bound by its message on stderr, src set twice, createImageBitmap and its refusals) and an image over http in http.js. tests/t1/webenv_image.sh: tests/golden/webenv/image_gl.js (12 lines) with the window's frame 2 (image_gl-2.png). Its reference is the picture's definition, not a capture: tests/data/images is twelve flat colours in a known order (gen.py), so PNG, GIF and BMP are exact, the JPEG within 1, and a lossless WebP equals the PNG it was encoded from on all 104,000 pixels. Checked that it can fail: with a bitmap's own flags dropped, lines 8 and 9 come out swapped and the runner says FAIL. tests/t1/webenv_phaser.sh. tests/native/codec_test.cpp: imageSize on each fixture, on a PNG cut inside its pixel data (sized, not decoded), on text and on nothing.
A change to another task's test, to know about: tests/golden/webenv/dom.js printed its order of events from a 1 ms timer and counted on the image's error event being a 0 ms timer set before it (the stub's). The event now comes a task after the bytes were read, as in a browser, which gives no such bound; the page prints after 20 ms. Its golden is unchanged.
Passed on this commit: webenv, qjs, qjs_robust, codec (t0); quickjs, webp, webenv_image, webenv_phaser, webenv_pixi, webenv_three, webenv_p5, webenv_canvas, webgl_libs, webgl2_tex (t1). Khronos pages of textures and extensions (260, conformance and conformance2): 209 pass, no regression against the pass list, and the 230 of them run for ZN-565 are unchanged page by page.

STATE OF THE CRITERIA after step 1: #1 not started (the truck of examples/webgl-studio). #2 half: Phaser's this.load.image is proven; PixiJS Assets.load is next. #3 not started. #4 not met, by decision, with the numbers above.
NOT DONE YET in this task: PixiJS and three.js loading a picture (tests), FontFace and document.fonts, criteria 1 and 3.

STEP 2 (commits 10e30569 and the one after it), which TAKES BACK part of step 1: createImageBitmap and ImageBitmap are removed again.
What happened: with createImageBitmap in the environment, PixiJS could not load any picture. Measured on both vendored versions, the page being `await Assets.load(url)` and nothing else: "Error: [Loader.load] Failed to load ... ReferenceError: Worker is not defined". Their loader reads (pixi-8.22.0.min.mjs) `globalThis.createImageBitmap && this.config.preferCreateImageBitmap ? this.config.preferWorkers && await WorkerManager.isImageBitmapSupported() ? ...`, preferWorkers is true by default, and isImageBitmapSupported makes a Worker with no test that one exists. Every browser that has createImageBitmap has Worker, so PixiJS never meets the pair we offered.
The three states, measured with PixiJS 8.22.0 on the same picture: createImageBitmap and no Worker: Assets.load fails. The same with the page calling Assets.setPreferences({ preferWorkers: false }): works, the texture from an ImageBitmap, the file's colours. No createImageBitmap: works unmodified, the texture from an HTMLImageElement, the same colours.
THIS CORRECTS docs/reports/games/js-game-libraries.md, which says "a Worker that is absent or throws on construction makes each library fall back" (3, notes) and "an absent Worker is enough today (every library falls back)" (6.1): true while createImageBitmap was absent, false for PixiJS 7.4.3 and 8.22.0 once it exists. A Worker that throws when made does not help either, measured on PixiJS 8.22.0 with a stand-in that throws a SecurityError: "Assets.load failed: Error: [Loader.load] Failed to load ... SecurityError: workers are not allowed here" (not run on PixiJS 7).
DECISION (RULES 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1):
  (1) createImageBitmap without Worker, as step 1 left it: 1,5,5,4,5,5,5 = 56. An unmodified PixiJS application loads no picture.
  (2) neither, until both: 4,4,5,4,5,5,5 = 62. PixiJS 7 and 8, three.js (TextureLoader; GLTFLoader falls back to it when createImageBitmap is undefined: third_party/three/examples/jsm/loaders/GLTFLoader.js line 2654, read, not run) and Phaser load pictures through image elements, unmodified.
  (3) both, Worker being a stand-in that runs the worker's script on the main thread inside a `with` scope: 3,3,4,2,5,5,3 = 48. A fake that other libraries would then take for a Worker.
  (4) both, with a real Worker (the report's G24): 5,5,4,3,5,4,1 = 59. A task of its own, and context creation lives in files this task was told to avoid.
  CHOICE: (2). The code and the tests of step 1's bitmaps are deleted, not parked: nothing could reach them. They are in commit f08d712f (lib/std/webenv.js class ImageBitmap and createImageBitmap, the flipY / premultiply flags of a source in next/src/gl/webgl_js.cpp domPixels, the bitmap lines of tests/golden/webenv/image.js and image_gl.js), tested there, for whoever brings Worker. The removal is one commit, so that it can be dropped at integration if the owner prefers (1) with a documented `preferWorkers: false`.
  A guard for it: tests/golden/webenv/image.js prints `createImageBitmap undefined ImageBitmap undefined Worker undefined`; adding one without the other changes that line.
LIBRARIES with a picture from a file, each unmodified and through its own loader, the pixels read back being the file's own colours (tests/data/images/fixture.png, twelve flat colours whose values are in gen.py):
  three.js r186, new TextureLoader().load(url): an HTMLImageElement, flipY true, largest difference over the twelve blocks 0 (tests/golden/webenv/three/texture.js, in webenv_three).
  PixiJS 8.22.0 and 7.4.3, await Assets.load(url) then a Sprite: "32x24 from HTMLImageElement | its red block 220,30,30,255 its olive block 60,60,20,255 its white block 255,255,255,255 its teal block 20,180,190,255 background 16,32,48,255 error 0" for both (tests/golden/webenv/pixi/v8/picture.js and v7/picture.js, in webenv_pixi).
  Phaser 3.90.0, this.load.image: see step 1.
Passed after step 2: webenv (t0); webenv_image, webenv_pixi, webenv_three, webenv_phaser, webenv_p5, webenv_canvas, webgl_libs (t1). The goldens of image.js and image_gl.js lost their bitmap lines and nothing else (17 and 9 lines unchanged).

STATE OF THE CRITERIA after step 2: #1 not started. #2 DONE: PixiJS Assets.load and Phaser this.load.image upload real pixels, checked on a sprite against the picture's defined colours. #3 not started. #4 not met, by decision.
NOT DONE YET: FontFace and document.fonts, criteria 1 and 3; createImageBitmap (moved to the Worker task, below).

HANDOVER (2026-10-11 02:05), written when the machine stopped launching programs: since 01:52:27 every non-Apple binary (zinc, python3, cmake, gtimeout) blocks in the kernel at launch and cannot be killed; nothing could be built or tested after that. Everything above was measured before 01:52:13. Nothing is uncommitted.
Done and tested: commits 47826551 (ZN-565), f08d712f, 10e30569, 53aa4fe4 on branch worktree-agent-ae37806b9139155c5. Criterion 2 is done.
Open:
- #1 (the truck of examples/webgl-studio): not started, and not reachable from this task's work. The scene runs in a zinc:script context, which does not load the web environment (ZN-568 left `new Script({web: true})` undone), and its hand-written document has no image element; GLTFLoader there needs createImageBitmap, which is out until Worker. The mapped test's command (`zinc run tests/golden/webgl-studio`, headless) was started at 01:54:27 to read GLTFLoader's message and never returned: that was the stall, not the scene, as far as is known; it was not run before the stall on this branch, so webgl_studio is UNVERIFIED on these commits.
- #3 (Khronos pages that need images): not started. Those pages run on tests/webgl-conformance/dom-shim.js, not on the web environment; the shim would need an Image over a decode native.
- #4: not met, by decision (numbers and follow-ups (a), (b) above).
- FontFace and document.fonts: not started, by decision: nothing can show their effect before ZN-570's text slice, and the engine's run-time font row (HostGfxLoadFont) takes a family or a file of the assets, not bytes. To do with ZN-570's text: a FontFace whose source is a file of the project maps to gfxLoadFont(file, px); bytes (data:, blob:, http, ArrayBuffer) need a new host row.
- ZN-570: not started. No decision on the Canvas 2D backend was made.
To run first when programs launch again, in next/ (rebuild before anything: `tools/build zinc codec_test`): tests/run --only webenv; --only codec; --tier t1 --only webenv_image, webenv_pixi, webenv_three, webenv_phaser, webenv_p5, webenv_canvas, webgl_libs, webgl_studio, zinc_gl_api_tour. The last two were never run on this branch. Then the whole Khronos suite once (ZN-565 #6). The brief's closing steps (git rebase main, rebuild, re-run) were not done.
Left behind by this agent, to know about: two of its own processes are blocked and could not be killed (PID 88229, the studio run; PID 89521, one WebGL probe started at 01:59:46 before the instruction not to probe arrived). They hold no file of the repository open for writing.

FOLLOW-UP TASKS (not created; for the coordinator to file):
(a) "Host: asynchronous file read and image decode on libuv, for the web environment and zinc:assets" (M). An image's bytes are read and decoded off the main thread inside the host (uv_fs and the thread pool), under the same permission checks as the file row, and handed to QuickJS as an owned buffer; a deterministic run completes at a fixed frame. Criteria: Image.src of a 4096 x 4096 PNG never makes a frame longer than 2 ms more than its neighbours (today 525 ms); a 1024 x 1024 one the same (today 50 ms); permissions still refuse a path outside the grants; webenv_image and webenv_phaser unchanged.
(b) "Host: read a file in one call" (S, next/src/host/sys_host.cpp readAll and the row's result). Criteria: reading a 40 MiB file through the file row takes under 30 ms on the development Mac (today 187 to 252 ms for 39.8 MiB, against 9 ms for one copy of those bytes); every fs test unchanged.
(c) "WebGL binding: upload a DOM source without the intermediate copy" (S). Criteria: texImage2D of a 4096 x 4096 RGBA image as decoded under 15 ms (today 26 to 29 ms).
(e) "Web environment: Worker, and createImageBitmap with it" (M; the report's G24 moved forward, or its first slice). A Worker with its own global scope, postMessage with structured clone and transferables, module and Blob URL scripts; createImageBitmap and ImageBitmap restored from commit f08d712f in the same change. Criteria: an unmodified `await Assets.load(url)` works in PixiJS 7.4.3 and 8.22.0 with createImageBitmap present (webenv_pixi's picture pages then say "from ImageBitmap"); the bitmap lines of f08d712f's image.js and image_gl.js pass again; three.js's GLTFLoader takes ImageBitmapLoader. Until then the truck of criterion 1 can only load through TextureLoader.
(d) "Web environment: createImageBitmap resizeWidth / resizeHeight" (S, after (e)), on a proven resampler to vendor (stb_image_resize2.h, public domain or MIT, from the project whose stb_image, stb_image_write and stb_truetype are in third_party/stb; it is not there today). Criteria: a bitmap of the asked size, compared with headless Chrome at SSIM 0.98.
<!-- SECTION:NOTES:END -->
