---
id: ZN-746
title: 'Runtime shaders: a SHADER fill on the GPU, the same effect on the CPU'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-16 15:11'
updated_date: '2026-10-16 15:56'
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
- [ ] #1 imageFromPixels / updateImage in zinc:gfx and lib/gfx.d.ts, with a T0 test; the lava face without the PNG round trip and with one draw, frame times on the Nexus 7 and the desktop before and after
- [ ] #2 a SHADER command drawn by the GLES 2 replay and the software raster; the same metaball program gives the same picture within tolerance on both (golden)
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
Not yet: step (b), the SHADER command on the GPU under the software-rastered UI in the Android window, and AC2-AC4.
<!-- SECTION:NOTES:END -->
