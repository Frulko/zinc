---
id: ZN-432
title: >-
  zinc:gfx source rectangles and images from bytes; the browser host draws
  images
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 18:13'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add rows drawImageRect(img, sx, sy, sw, sh, dx, dy, dw, dh, alpha, flags) (flip; nearest or linear) and imageFromBytes. Implement them in the software rasterizer, display-gl and the wasm host; the wasm host also draws baked images and fonts. Report: docs/reports/games/toolchain-assets-loading.md (1.1, 4.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc:canvas 9-argument drawImage uses the row and pixel goldens are unchanged
- [x] #2 a sprite-sheet frame is equal in the interpreter, AOT and headless Chrome
- [x] #3 game-2d's sprites show in the wasm export
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (branch worktree-agent-a016c060fa17bfabf), 2026-10-10. tools/usage: n/a (sub-agent session).

API as shipped (lib/gfx.d.ts, kGfxModule in src/frontend/modules.cpp):
- `enum ImageFlag { FlipX = 1, FlipY = 2, Nearest = 4 }`
- `drawImageRect(image, sx, sy, sw, sh, dx, dy, dw, dh, alpha?: i32 = 255, flags?: i32 = 0): void`. The source rectangle is in the pixels of imageWidth / imageHeight; what of it lies outside the image is not drawn; sw, sh, dw, dh must be > 0 (else nothing).
- `imageFromBytes(bytes: u8[]): i32`: PNG or JPEG, -1 when the bytes are not one or declare more than 2^24 pixels; a runtime image with its alpha, freed by destroyImage.
- rows appended after host.netLog: `host.gfxDrawImageRect "iddddddddii>n"`, `host.gfxImageFromBytes "B>i"` (served by hostGfx: `isSpriteRow` in runtime.h; a direct entry in hostFast for the first).

How: one IMAGE command per call, 48 bytes as before. x, y, w, h is the rectangle painted; pad bit kImageBox says that s, c1, off, n hold four floats, the box the whole image would cover (raster::image_box / set_image_box); a negative size mirrors. raster.cpp draw_boxed (out of line) samples through the box for baked and runtime images; same() and cmd_hash() count `off` for an IMAGE. Runtime images get an alpha flag (raster::dyn_set_alpha: 0xAARRGGBB, straight); endImage clears it (a render target is opaque). gl_replay.cpp draw_image takes the texture coordinates from the box, nearest on baked textures too, alpha of a decoded image through grad 1 in the IMAGE branch of the shader. Decoder: static stb_image (PNG + JPEG) in src/res/codec.cpp (zn_codec, linked by AOT programs).

Acceptance criteria, on test output of the rebased branch:
- #1: `PASS image_rect`: zinc:canvas 9-argument drawImage calls drawImageRect, and tests/data/image_rect/canvas.ts (13 draws: quarter x2, x3, x1.5, fraction of a pixel, source between texels, pixel for texel, half outside the image, reduced, globalAlpha, under a transform, smoothing off) is pixel for pixel canvas-golden.png, the frame of the engine before the row with the old clip-and-scale source (framehash 4dc53e1e85ef56cc both). `tools/proto-capture compare --canary` 4 of 4, and canvas/sketch, flipctl, ui/lottie-gallery 3 of 3.
- #2: `PASS image_rect` (interpreter, QuickJS and AOT: framehash 400x180 7be120a0ebbb5c8e; check.py: every pixel of 7 nearest sprites x 2 rows computed from the sheet, baked row == decoded row) and `PASS image_rect_wasm` (web.ts: interpreter hash == AOT hash; headless Chrome against the interpreter frame: 0 pixels over 2, max 2, mae 0.015; check.py on the Chrome frame with slack 0, so opaque texels are exact and only translucent ones are off by up to 2: the 2D canvas keeps premultiplied pixels).
- #3: `PASS image_rect_wasm`: `zinc new game-2d` exported with --target wasm, started with Enter in headless Chrome: play scene, 356 pixels of the player's fill, 1098 of the coins'.
- GPU (asked by the coordinator): `PASS image_rect_gl`: GL replay against the software frame at the window's density (4): 0.000% of the pixels over 24, mae 0.051, max 2; with the old replay the same test gives 30.2% / 18.9. examples/ui/gl-check (whole images) is byte for byte the old replay's capture. `PASS gl_renderer`.

Decisions (to file as decision records; no number allocated here):
- A. The source rectangle lives in the IMAGE command as the box of the whole image, in the four fields an IMAGE did not use. Options: (1) four floats in the point pool: a frame is then limited by ZRT_POINT_POOL (32768 floats = 8192 sprites by default, 256 on the ESP32) and same()/cmd_hash() need a payload rule; (2) a larger Cmd: every command pays, scene dumps and the bench corpus change format; (3) CLIP + IMAGE + UNCLIP recorded by the row: three commands and a scissor change (a GL flush) per sprite, no mirror; (4) chosen: no pool, 48 bytes, flips are a negative size, and the linear path computes exactly what the clip-and-scale emulation computed, which is why criterion 1 holds pixel for pixel.
- B. Sampling follows the GPU, not the 2D canvas: a linear sample reads the texels around the source rectangle (clamped at the image's edges), nearest takes the texel under the pixel centre, nothing is painted outside the image. Why: the design (toolchain-assets-loading.md 4.3: UVs into the batcher, the atlas packer extrudes), identity with the previous canvas2d frames, and software == GL. Cost: in a browser a linear sprite differs at the edges of its rectangle (the 2D canvas clamps to it); nearest sprites are identical. One texel a pixel on whole pixels takes the nearest path (a copy).
- C. imageFromBytes decodes PNG and JPEG only, with a second static stb_image in zn_codec: AOT programs link zn_host_gfx + zn_codec, not zn_res (the baker's copy) nor libwebp, and next/CMakeLists.txt and main.cpp's link line were not to be touched. codec.cpp.o text 36.5 -> 87.2 KB (+50.7 KB in a built program that draws, about 1.3% of the 3.9 MB test binary). WebP and GIF at run time: follow-up 3.
- D. A decoded image is a runtime image with an alpha flag, not a new entry of the baked table: destroyImage frees it, the GL replay uploads it like any runtime image. Limit: ZRT_DYN_IMAGES = 64 runtime images at once, shared with canvases and video frames.
- E. zinc:canvas with imageSmoothingEnabled = false and a source rectangle now samples nearest on baked images too (it was ignored for them), and a 1:1 source rectangle of a runtime image at a fraction of a pixel is blended (linear) where the old path copied rows: both as on the web; no golden covered them.

Measured (Intel Mac, back to back, eight alternating rounds of the baseline binary and the new one, load average 4.3 to 6.0, other trees building):
- existing drawImage, baked images: 600 whole-image draws at 1000x640, scene replayed 60 times on one thread by `zinc capture --scene --bench` (the harness of tools/bench-render): median of the medians 73348 us before, 73536 us after: ratio 1.003 (minima 68671 / 70110: 1.021); user CPU 4.552 / 4.579 s: 1.006. Same pixel hash 7d51afab9594b0a3.
- existing drawImage, runtime image: 600 draws a frame (row copy, nearest, linear), 61 frames rendered (ZINC_FRAMEHASH=all), user CPU 3.563 s before, 3.556 s after: 0.998. Same hash f670fadce27f3036.
- with draw_boxed inlined into draw_image the same measures gave 1.018 and 1.032: hence the noinline (commit perf(raster)).
- first build of the worktree: 2 min 05 s wall for `tools/build zinc`, ccache 639 hits and 1 miss of 640 calls.
- GL replay of the test frame: 28 quads in 10 draw calls a frame (a filter change on a texture flushes the batch: ZN-581's ground).
Numbers taken under load are indicative; to remeasure alone: the scripts are described in the report to the coordinator (a scene of 600 drawImage, `zinc capture --scene <scn> <entry> --bench 60 1`).

Follow-up tasks proposed (not created here):
1. "Browser host: imageFromBytes, runtime images and render targets" (size M). The page has no decoder: host.gfxImageFromBytes answers -1, createImage / beginImage / endImage / destroyImage warn. Build src/res/codec.cpp into vm-web.wasm, export a decode entry, give each runtime image an OffscreenCanvas. AC: tests/data/image_rect/main.ts (baked and decoded rows) passes check.py in headless Chrome; a render target drawn with drawImage shows in Chrome; zinc:assets readBytes reads the exported assets/ in the page (or the task depends on ZN-449).
2. "Browser host: baked fonts, gradients, clip and translate" (size M). Text is the browser's fonts (metrics differ from the baked ones), host.gfxGradient, gfxClip, gfxTranslate, gfxShadow, gfxPolygon warn: game-2d's title has no background and its white title is invisible on the page. AC: game-2d's title scene in headless Chrome within pixel-compare tolerance of the native frame; textWidth equal to the native value for the baked fonts; clip and translate honoured by drawImageRect in Chrome.
3. "imageFromBytes: WebP and GIF" (size S). AC: a WebP and a GIF file decode at run time in the interpreter and in an AOT build (libwebp linked into built programs only when used); unknown formats still answer -1.
4. "QuickJS: the zinc:gfx rows appended after the host block" (size S, found here). installHost skips every row past HostHostLast except the layout ones, so __host_gfxSetResize, __host_gfxCommands and __host_gfxCommandsFree do not exist under --engine quickjs: onResize(), commandCount() and commandsFree() throw a ReferenceError there. AC: a program calling the three runs on QuickJS with the interpreter's output.
5. "ZINC_FRAMEHASH and captures of a frame that does not cover the surface" (size S, found here). gfx.cpp grab() renders into memory that hal_alloc does not clear: a program without clear() (tests/conformance/canvas2d.ts) gets a different frame hash at every run. AC: the hash of such a program is the same on 10 runs; untouched pixels are 0.
6. "host_direct: golden line order" (size S, found here; fails on main before this task). tests/data/host_direct/golden.txt has the frame hash before the program's line; since ZN-638 the program's output comes first. The hash itself matches (8d0b12038e7558df). AC: PASS host_direct.
7. "Sprite draws in the software rasterizer: speed" (size S, optional, with ZN-581). draw_boxed computes a float position per pixel; a 16.16 step per row and a per-row alpha run would be the fast path for tile maps on devices without a GPU. AC: a bunnymark of drawImageRect in bench/render with its number in the perf log.

affected.json mapping to add:
{"paths": ["../runtime/raster.cpp", "../runtime/gfx.cpp", "../runtime/zrt_raster.h", "src/host/gfx_host.cpp", "src/res/codec.cpp", "../plugins/canvas2d/", "tests/data/image_rect/", "tests/t1/image_rect.sh"], "tests": ["image_rect", "canvas"], "canary": true},
{"paths": ["../runtime/gl_replay.cpp", "tests/t1/image_rect_gl.sh"], "tests": ["image_rect_gl"]},
{"paths": ["targets/wasm/", "tools/wasm-export-test", "tests/t1/image_rect_wasm.sh"], "tests": ["image_rect_wasm"]}
(image_rect_gl opens a GL window; image_rect_wasm needs Chrome and the pinned zig, both skip with 77 otherwise.)

Not verified: proto_devtools (skipped: the prototype's node_modules are missing in the worktree), so the prototype compiling plugins/canvas2d with drawImageRect (declared in runtime/zrt.h, stubbed in sim/gfx.mjs) was not run; the 2^24 pixel limit has no permanent test (checked by hand: 4100x4100 -> -1, 4096x4096 decodes); no ARM, Linux or device run (cross-platform pass); the GL comparison ran on this Mac's GPU only. Known failures of this machine seen again and unchanged by the task (same frames before and after, 0 differing pixels): three_3d, video.
<!-- SECTION:NOTES:END -->
