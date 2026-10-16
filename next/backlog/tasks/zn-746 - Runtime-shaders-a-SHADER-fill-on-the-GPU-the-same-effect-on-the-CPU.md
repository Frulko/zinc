---
id: ZN-746
title: 'Runtime shaders: a SHADER fill on the GPU, the same effect on the CPU'
status: Backlog
assignee: []
created_date: '2026-10-16 15:11'
labels:
  - perf
  - gl
  - size-L
milestone: m-21
dependencies:
  - ZN-741
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
