---
id: ZN-581
title: 'GPU sprite path for zinc:gfx images (rotation, scale, tint, blend, batching)'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 08:12'
updated_date: '2026-10-11 11:24'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-432
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native-tier zinc:gfx bunnymark costs 25 ns per sprite of program time in AOT but the software rasterizer takes 11 ms for 2,000 26x37 sprites and 107 ms for 20,000 at Retina scale, so the native tier is capped near 3,000 sprites. Extend ZN-432's drawImageRect row with rotation, scale, tint and blend mode, and draw image commands in display-gl as textured quads batched by texture; the software rasterizer stays the reference. ZN-412 (GL backend by default) makes this the default path; ZN-467 is the fixed-function replay for GPUs without shaders; atlases come from ZN-438. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the zinc:gfx bunnymark (26x37 sprites, 800x600 Retina) renders 20,000 sprites with frame work <= 4 ms in AOT on the GL backend (today raster 107 ms)
- [x] #2 pixel parity with the software path within display-gl's GPU tolerance
- [x] #3 the GLES2 (Pi 3) path compiles under the D29 prelude
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (branch worktree-agent-afacec4d21cff58d2), 2026-10-11. tools/usage: n/a (sub-agent session).

API as shipped (lib/gfx.d.ts, kGfxModule in src/frontend/modules.cpp):
- `enum Blend { Normal = 0, Add = 1, Multiply = 2, Screen = 3 }`
- `drawImageRect(image, sx, sy, sw, sh, dx, dy, dw, dh, alpha = 255, flags = 0, rotation = 0, tint: u32 = 0xFFFFFF, blend = 0)`: rotation in radians, clockwise on the screen, around the centre of the destination rectangle, after the matrix of setTransform (a NaN or infinite angle draws nothing); the tint multiplies the colour; scale is the destination size against the source one, as before. Existing calls are unchanged.
- The row `host.gfxDrawImageRect` grew in place to `iddddddddiidui>n` (14 parameters). The host calls of the interpreter (src/rt/rtcalls.cpp hostRt) and QuickJS (src/qjs/qjs.cpp hostFn) decoded into arrays of 12: QuickJS silently dropped the 13th and 14th (its frames differed), and the interpreter's hostRt already wrote past its array for zinc:gl's glTexSubImage3D (13 parameters). Both now use `zn::kMaxHostParams` (16), and runtime.h checks at compile time that no row has more.

How:
- Rotation: the matrix in force times a turn around the centre (gfx.cpp), so the command becomes an XFORM IMAGE that both renderers already draw (ZN-263.01, ZN-432): no new command kind. Cost: 15 floats of the point pool per turned sprite.
- Tint and blend live in the 48-byte command: pad bit kImageTint says r holds the tint as a float (24 bits, exact; such an image has no radius), pad bits 4-5 the mode (zrt_raster.h image_tint / image_radius / image_blend). Under a matrix r travels in the XFORM payload, pad in the Cmd. to_physical leaves a tint unscaled.
- Software (the reference, raster.cpp): draw_boxed and draw_xform multiply each channel, (c t + 127) / 255, and blend with blend_as: add d + c a, multiply d (1 - a + c a), screen d + c a (1 - d), in the integer forms the GPU produces.
- GL replay: the shader multiplies the texel by the tint carried in the vertex colour (white leaves it unchanged: the old frames are the same); a blend mode is glBlendFunc on the premultiplied colour the shader writes (PixiJS's functions: ONE/ONE, DST_COLOR/ONE_MINUS_SRC_ALPHA, ONE/ONE_MINUS_SRC_COLOR), and a change of mode ends a batch like a change of texture. Sprites of one image and mode are one draw call per 8192 quads.
- Speed: the CPU culling of ZN-412.01 is skipped for a frame without an opaque square RECT (it hid nothing behind a clear and cost about 1 ms at 20,000 sprites, its threads included); draw_image keeps the resolved texture of the last runtime image of the frame, so consecutive sprites skip four lookups.
- AC3: the shader sources moved to runtime/gl_replay_shaders.h; tests/native/gl_replay_es2.cpp compiles and links the three programs as GLSL ES 1.00 under display-gl's GLES 2 prelude (zgl_program, not __APPLE__) through glslang with the WebGL 1 rules (src/gl/essl_check). A while loop and texture() put in a shader make it fail (checked, reverted).

Decisions (reversible):
- Extend drawImageRect rather than add a drawSprite row: one call for a sprite, a sheet frame or a tile, the row extended in place (it is internal to the engine; the browser host reads rows by name and ignores the extra arguments). A drawSprite with a row of its own would be a second sprite call to keep in step.
- Rotation through XFORM (no renderer code, parity already tested) over a SPRITE command kind with its own payload (fewer floats, but every pass that reads kinds would learn a new one).
- Four blend modes, the ones PixiJS draws in WebGL without filters (normal, add, multiply, screen); others (Phaser's ERASE, LOVE's subtract, lighten, darken) wait for a program that needs them.
- Batching stays in painter's order (consecutive commands of one texture and mode); multi-texture batches are ZN-582's batcher and ZN-438's atlases.

Acceptance criteria, on real output (Intel Mac, AMD Radeon Pro 555X, GL 4.1; 800x600 window at Retina density, surface 1600x1200):
- #1: tests/data/sprites/bunny (the report's gfxbunny.ts: drawImage of a 26x37 runtime image per sprite; MODE tint and turn added), built with zinc build, N=20000 ZINC_PROFILE=1 ZINC_GL_STATS=1. Frame work = the profile's work p50 + the GL replay's CPU to submit the frame:
  - before (load 3.01): 0.64 + 3.38 = 4.02 ms (0.56 of it culling, 0 commands hidden); GPU 9.5 ms.
  - after, run 1 (load 3.31): 0.52 + 2.18 = 2.70 ms; GPU 10.0 ms.
  - after, final run (load 2.81): 0.95 + 2.80 = 3.75 ms; GPU 10.1 ms (the program's own update, the same code, took 0.39 ms against 0.22 in run 1: the CPU clock varied between the runs).
  - tinted and Add-blended, 20,000 (load 2.81): 1.64 + 2.99 = 4.63 ms; turned and tinted, 15,000 (load 2.66): 2.13 + 2.65 = 4.78 ms. Not the criterion (the bunnymark is drawImage), over 4 ms on this machine: recording a turned sprite costs ~110 ns (cos, sin, the XFORM payload).
  - The software raster took 107 ms for the same 20,000 sprites (the report's number, M1 Pro).
  - All taken once beside another agent's builds: remeasure on a quiet machine (the M1 Pro of the report).
- #2: PASS image_rect_gl: tests/data/image_rect/sprite.ts (turned, tinted, the four blend modes at alpha 255 and 128 over a dark and a grey background, nearest and linear, baked and decoded, a turn inside setTransform) on the GL replay against the software frame at the same density: 0.113% of the pixels over 24, mae 0.129 (limits 1% and 1, as for setTransform: the raster smooths a turned edge, the GPU cuts it; the differences sit on the edges of the turned sprites), and sprite_check.py finds the tinted and blended nearest sprites of the GL frame within 2 of the formulas. Software: PASS image_rect (sprite-golden.png, sprite_check.py exact, the same hash 1998befec914fe1a on the interpreter, QuickJS and the AOT build; main.ts's 7be120a0ebbb5c8e unchanged).
- #3: PASS gl_replay_es2 (commands, occlusion, stencil: GLSL ES 1.00 ok). Not run on a Pi.

Tests run: image_rect, image_rect_gl, gl_renderer, gl_convex, gfx_transform, gpu_strokes, many_images, canvas, image_reuse, scene_dump, backend_sw, damage_sig, gl_replay_es2, zinc_gl_api_tour, qjs, qjs_robust, modules, checker, map_rows, aot: all PASS; tools/proto-capture compare --canary 4 of 4. Not run: --all (T2), image_rect_wasm (the browser host ignores the new arguments, below).

For later.md (written by the coordinator):
- Browser host (targets/wasm/glue/worker.mjs): drawImageRect's rotation (ctx.rotate around the centre), blend (globalCompositeOperation lighter, multiply, screen) and tint (an offscreen canvas) are ignored there.
- A turned sprite takes 15 floats of the point pool: about 17,000 per frame on desktops (ZRT_POINT_POOL 262144) before the pool is full; let the pool grow like the commands (ZRT_GROW_DRAW_CMDS).
- GPU time: 20,000 Retina sprites take 10 ms of GPU on the Radeon Pro 555X (77 M blended pixels through the uber-shader), before and after this task; measure a sprite program of its own for runs of sprites (display-gl.md found a split worse for interleaved UI) or opaque sprites in the occlusion pass.
- Recording a turned sprite costs ~110 ns in AOT (cos, sin, the matrix, 15 floats): ZN-582's batcher, or an angle without the XFORM payload.
- Cross-platform pass: the sprite path on a Pi 3 (GLES 2, VC4) and Linux GL, frames against the software ones.
- zinc:canvas: globalCompositeOperation lighter, multiply, screen onto the blend modes of drawImage.
<!-- SECTION:NOTES:END -->
