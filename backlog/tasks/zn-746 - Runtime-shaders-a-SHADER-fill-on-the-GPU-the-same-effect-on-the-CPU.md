---
id: ZN-746
title: 'Runtime shaders: a SHADER fill on the GPU, the same effect on the CPU'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-16 15:11'
updated_date: '2026-10-16 21:39'
labels:
  - perf
  - gl
  - size-L
milestone: m-21
dependencies: []
ordinal: 196700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: the lava lamp face of examples/music (src/faces.ts lava()) lags badly on the Nexus 7. It is a metaball field a fragment shader would compute, done on the CPU because zinc:gfx has no shader: every frame it computes 80x60 in Zinc, encodes a PNG (CRC, Adler), has the engine decode it, then draws it four times full screen with alpha to hide the bilinear grid, and keeps the whole screen animating. Give zinc:gfx what Skia's SkRuntimeEffect, Flutter's FragmentProgram and React Native Skia's RuntimeEffect give: (1) raw pixel images, imageFromPixels(rgba, w, h) and updateImage(img, rgba) (no PNG round trip; on the GPU a glTexSubImage2D of the changed texture), and a smooth upscale filter so one draw replaces the four taps; (2) a SHADER command in the command list: a fill of a rectangle (or rounded rect / path) by a small fragment program in GLSL ES 1.00 with float/vec uniforms and up to two images, compiled once and cached, replayed natively by the GPU replay (mediump-safe for Tegra 3, D119 layer), and on the software raster by a CPU path at a reduced resolution then upscaled (an interpreter of the same program, or a Zinc callback that fills the pixels, decided by measure); (3) damage limited to the shader's rectangle. Then the lava face uses it, unchanged elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 imageFromPixels / updateImage in zinc:gfx and lib/gfx.d.ts, with a T0 test; the lava face without the PNG round trip and with one draw, frame times on the Nexus 7 and the desktop before and after
- [x] #2 a SHADER command drawn by the GLES 2 replay and the software raster; the same metaball program gives the same picture within tolerance on both (golden)
- [ ] #3 the lava face at 60 fps on the Nexus 7 with the GPU replay and at least 30 fps with the software raster, in docs/reports/zinc-next-perf.md
- [ ] #4 a decision record: the shader language (GLSL ES 1.00 subset vs SkSL-like), the CPU path, and what WebGL (zinc:gl) and three.js keep doing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner, "on est sur android là"): do not wait for ZN-741 on Android: step (a) raw pixel images and one smooth draw first, then the SHADER as a GPU layer under the software-rastered UI in the SDL window (display-gl's overlay-with-GPU-layers model), the full GPU replay path joining when ZN-741 lands.
2026-10-16, step (a) (worktree agent): raw pixel images and one smooth draw.
- zinc:gfx imageFromPixels(rgba, w, h) and updateImage(img, rgba) (lib/gfx.d.ts, src/frontend/modules.cpp, two appended graphics rows in include/zn/runtime.h, src/host/gfx_host.cpp): RGBA bytes into a runtime image, alpha found from the bytes, a new version per update (the GL replay uploads only that texture again; the frame diff sees the version). Too few bytes: -1, or no change.
- ImageFlag.Smooth = 8 (IMAGE grad 2): a cubic B-spline instead of the linear blend for a small picture stretched far. Software raster: raster.cpp draw_smooth, separable (the four source rows blended once per row, the columns' taps and weights computed once per call, four taps a pixel); GL replay: the same spline in the image shader with four linear taps (the texture's size in v_box.zw). Opaque runtime pictures only; an image with alpha keeps the linear blend on both.
- examples/music lava(): the field into an RGBA array, imageFromPixels once then updateImage, one drawImageRect with ImageFlag.Smooth over the screen; the PNG encoder (CRC, Adler, chunks) and the four half-texel taps are gone. Same look (screenshot /tmp/zn743/out/lava-after2.png: no grid).
- Test: tests/t0/image_pixels.sh (headless, interpreter; QuickJS the same frame hash; AOT checked by hand, same hash 5280fa742c372763): the image from bytes and the refusals, updateImage shows the mirror, a short update changes nothing, the smooth stretch of a step is a rising ramp without the linear one's kinks (4-pixel second difference: linear at least 12, smooth at most 6).

Measured (AC1, numbers for docs/reports/zinc-next-perf.md, written by the coordinator):
- Nexus 7, software raster (ZINC_PRESENT direct, lava face 1280x704, ZINC_PRESENT_STATS per 120 drawn frames): before 4.0 fps, interval p50 242-245 ms, raster p50 200-203 ms; after 21.9 fps in the panel, interval p50 44-48 ms (later windows 109 ms), raster p50 28-32 ms (76 later). The rest of a frame: the field in Zinc and the clock over it.
- Desktop window 1280x704 (loaded machine): software raster before raster p50 25.2 p99 38.4 ms, interval p50 28.1 (36 fps); after raster p50 3.3 p99 6.9 ms, interval p50 16.2 (60 fps). GL replay: work p50 2.02 -> 1.03 ms, 60 fps both.
2026-10-16, step (b) (worktree agent): runtime shaders.
- zinc:gfx shaderProgram(fragment, scale = 1), drawShader(program, x, y, w, h, uniforms), shaderAvailable() (lib/gfx.d.ts, modules.cpp, three appended graphics rows). A program is GLSL ES 1.00: its main() writes gl_FragColor from v_uv (0..1 over the box), u_size (the box in pixels) and u_p[8] (up to 32 uniforms); `scale` lets a GPU shade it at 1 / scale of the resolution and stretch it (a smooth field).
- raster: a SHADER command (Kind after XFORM; res = program, n uniforms in the point pool). The software raster draws nothing for it, or the hole of a GPU layer (raster::shader_holes, which also makes a change of uniforms alone no damage). The program keeps its own CPU path, chosen with shaderAvailable().
- gl_replay.cpp shader_quad: the program compiled at its first use behind a fixed head (zgl_program, so GLSL 1.50 on the desktop, #version 100 on GLES 2), drawn alone in paint order at the command's depth; the includer gives the sources (glr::shader_source): the SDL GL window and display-gl's replay do, and set gfx::shaders_drawn.
- Android without ZN-741 (hal_sdl.cpp): a program that makes a shader before its first frame is shown gets a GL window instead of the CPU window buffer (zn_hal_sdl_gpu_layers from the host row; the buffer was never locked, so EGL can take the surface; ZINC_GPU_LAYERS=0 keeps the CPU window). Each frame: the SHADER commands of the frame drawn by GL (into a texture at 1 / scale, the smallest scale of the frame's programs, stretched linearly; ZINC_SHADER_SCALE overrides), then the software frame over them: its damaged rows rendered twice (holes black and white: alpha and premultiplied colour, render_holes) and uploaded, drawn with premultiplied blending. Uniform changes are no damage, so an animated shader under a still UI costs the CPU nothing.
- examples/music lava(): the metaball field as a shader (scale 4) where shaderAvailable(), the step (a) picture otherwise; same look (screenshots /tmp/zn743/out/lava-gpu.png, lava-s4c.png).
- Test tests/t1/shader_gl.sh (opens a window, 77 without one): tests/data/shader/main.ts, three metaballs, the GL replay's SHADER frame against the software raster's CPU path at the same density: 0% of pixels over 24, mae 0.25 to 0.30, max 13; the first GL frame (CPU path) differs from the third (the shader drew).

Measured, Nexus 7 lava face (trace frames 100 to 590, ZINC_PERF_HUD and ZINC_PROFILE on): GPU layer at full resolution interval p50 41.7 ms (24 fps; Tegra 3 takes about 40 ms to shade 1280x704 and blend the UI); at 1/2 17.3 ms (58 fps); at 1/4 (the program's scale, the default now) 16.66 ms, 61 fps in the panel, 127 of 490 frames late (the app's own stalls: work p99 60 ms, a few frames of 300 to 650 ms); the software raster CPU path in the same session 87 to 91 ms (11 fps; 44 ms when the tablet was cooler, step (a)). Desktop GL window: work p50 0.19 ms with the shader (the field is no longer computed in Zinc).

AC status: AC1 done (step a). AC2: the GL replay draws SHADER (desktop GL core and display-gl, and the Android GPU layer on GLES 2 with the same shader_quad); the software raster draws the program's CPU path; golden comparison in shader_gl.sh. AC3: 60 fps on the Nexus 7 with the GPU layer; the software raster gives 11 to 22 fps, not 30: open. AC4: the decision text is below for the coordinator to record (a worktree takes no decision number).

Decision text (runtime shaders, ZN-746): Question: the language of zinc:gfx runtime shaders, their CPU path, and what WebGL and three.js keep. Options scored (RULES section 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1): (A) GLSL ES 1.00 fragment main() behind a fixed head (v_uv, u_size, u_p[8]): fit 5, perf 5, size 5, maint 4, licence 5, portability 3, effort 5 = 74; (B) an SkSL-like language of our own translated to GLSL, Metal and a CPU interpreter: 4, 4, 2, 2, 5, 5, 1 = 54; (C) no GPU program, a Zinc callback per pixel on the CPU: 2, 1, 5, 4, 5, 5, 4 = 52. Choice A: what WebGL 1 and every GLES 2 GPU compile natively, glslang validates it, mediump-safe by construction. CPU path: the program's own Zinc code at a lower resolution drawn with ImageFlag.Smooth, chosen with shaderAvailable() (an interpreter of GLSL per pixel is ruled out: the 80x60 field plus a smooth stretch is already 22 fps on the Nexus 7's CPU). zinc:gl (WebGL) and three.js keep their own contexts and shaders: SHADER is a 2D fill in the command list, not a GL API. Revisit: a Metal replay on iOS (translate with SPIRV-Cross from glslang's SPIR-V), or programs that need several passes.

Lines for backlog/later.md:
- ZN-746: Cross-platform pass: the GPU layer under the CPU frame for the Pi's KMS/EGL and webOS windows (display-gl's overlay), and the lava face on a Pi 3 and the TouchPad.
- ZN-746: the software raster at 30 fps on the lava face of a Nexus 7 (11 to 22 fps measured): the CPU path at a lower resolution than the screen, or the smooth stretch on NEON.
- ZN-746: a SHADER under a matrix (setTransform) and inside a rounded clip on the Android GPU layer (the hole is square there); several shader programs per frame at different scales.
- ZN-746: the decision to switch the Android window to GL needs the program's first shader before its first frame: a program that makes one later keeps the CPU path (shaderAvailable false); a window that can change kind at run time would need the surface disconnected from the CPU producer.

Handover: open are AC3's software-raster half (30 fps on the Nexus 7 CPU path) and AC4's record (text above). Next: tests/run --tier t1 --only shader_gl; on the device ZINC_GPU_LAYERS=0 for the CPU path.

2026-10-16 (ZN-741/744 worktree agent, owner's request): a SHADER follows setTransform. Cause: drawShader recorded its box with the translation only (box()), never through the matrix of gfx.setTransform, so music's lava field stayed at the slide's resting place and showed whole while the carousel moved (on the Android GPU layer and in any GL replay alike). Fix (runtime/gfx.cpp drawShader): the box goes through the matrix (a turn or a skew: its upright bounding box, the field drawn unturned there; ponytail comment). The hole in the software frame and the GPU layer's quad both read that box, so they move together; what is drawn over the shader (a fade, the clock) composites over the hole as before, and clips around it (rounded ones too: the raster restores the corners over the hole) shape it. No alpha argument for drawShader: a fade is a layer drawn over it (later.md).
Proof: tests/data/shader/main.ts draws the field as a card on a slide (setTransform by (15%, 10%), a rounded clip of 18 px, a box drawn over it, a translucent black layer over everything); tests/t1/shader_gl.sh compares the GL frame with the CPU path: 0.000% of pixels over 24, mae 0.388 (without the fix: 43.9%, mae 24.2). On the Nexus 7: a screen recording of a scripted swipe from the player to the clock slide, before and after (docs/reports/zinc-next-android/music-lava-slide-before.png, -after.png): before, the field covers the screen at once while the time slides in; after, it comes in with its slide.
Measured on the Nexus 7 (examples/music, lava face, palette 0, perf panel on; before = the APK built from ZN-746's tree at 18:16): at rest 76 late frames of 290, interval p99 35.7 ms before; 67 late, p99 33.2 after. The swipe: 94 late of 290, p99 172.5 ms before; 85 late, p99 205.3 after (frames of 160 to 250 ms while the carousel moves, on both: the GPU layer path renders the whole damaged screen twice for the holes, converts and uploads it, 3.6 MB at about 100 MB/s).
Lines for backlog/later.md:
- ZN-746: the GPU layer path renders the damage twice (holes black and white) even where no SHADER is: render the rest once, and upload only the changed rectangles into a staging texture; a carousel swipe costs 160 to 250 ms a frame on the Nexus 7.
- ZN-746: drawShader with an alpha (and an XFORM of SHADER for turned shaders) if a program needs to fade or turn one itself.
<!-- SECTION:NOTES:END -->
