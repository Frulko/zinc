# display-gl doc audit

## What it is
The GPU screen: OpenGL 3.2 in an SDL window on the Mac, KMS/GBM/EGL/GLES2 on a Pi or Linux board, GLES2 on the HP TouchPad. The UI is an overlay over layers that GPU plugins (`zinc:mapping`, 3D) draw; `renderer: "gl"` replays the draw lists on the GPU.

## Targets and status
- plugin.json: `macos`, `rpi1`, `webos`, `linux`; options `key`, `fullscreen`, `mode`.
- macOS: verified. Pi 3B+ arm64 `linux`: verified (frames, GL renderer, fps tables). rpi1 (Alpine/armhf): builds in docker, not run. Pi touch under `renderer: "gl"`: not verified. webOS: runs on the TouchPad (later.md, hp-touchpad report) but not in the page's support table.

## What the docs have
- [x] Overview + zinc.json snippet (`docs/plugins/display-gl.md`, 256 lines)
- [x] Install/requirements per target (brew sdl3, console, groups, Alpine vs linux target)
- [~] Quick start: JSON only; no "run it" commands
- [~] Options: 3 table rows; `renderer` is missing (see below); env vars scattered in prose
- [x] How it works, input, ZINC_SHOT behaviour, zgl.h shader rules
- [~] Example: `examples/video/mapper`, `quad`, `bounce`, `examples/3d/cubes`, `model` use it; the page names none
- [ ] Screenshots: none on the page (docs/img has `3d-cubes.png`, `3d-model.png` that could serve)
- [ ] Tutorial: nothing for "write a GPU layer plugin with zgl.h"
- [~] Commands: `ZINC_*` listed in tables of benchmark sections only
- [~] Troubleshooting: GPU hang notes and `auto` fallback exist but inside the lab notebook sections
- [x] Tests: `gl_renderer`, `gpu_strokes`, `shader_gl`, `image_pixels`, `gl_offscreen`...

## What is missing (priority order)
1. Add `renderer` (`cpu|gl|auto`, default cpu on macOS, auto on KMS/webOS, env `ZINC_RENDERER`) to the options table and to plugin.json `options`.
2. A webOS row in the support matrix (GLES2 through Palm's SDL, the default display of a TouchPad program; relation to display-webos).
3. One env-variable table: `ZINC_RENDERER, ZINC_GL_MODE, ZINC_GL_INFO, ZINC_GL_STATS, ZINC_GL_TIME, ZINC_GL_DIRECT, ZINC_GL_PIPE, ZINC_GL_MSAA, ZINC_VSYNC, ZINC_ZOOM, ZINC_SCALE, ZINC_TEST_SCREEN`.
4. Move the Pi benchmark/phase notebook (about 150 lines) into a report; keep a 10-line "Measured" summary.
5. A tutorial "A GPU layer under the UI": a 40-line `zgl_layers` plugin and the `key` colour; screenshot of the result: `ZINC_SHOT=out.bmp zinc run examples/video/mapper`.
6. Gamepads: ZN-574 says display-gl's own event loop reads none; add to Limits.
7. Document the DRM master/console requirement as a troubleshooting row ("black screen, run from a text console"). (hardware to verify)
8. Pi 3 film cost (ZN-731), webOS frame cost (later.md): note in Limits.

## Wrong or stale
- Options table omits `renderer` (code and the page's own heading use it).
- Support matrix has no webOS although plugin.json targets it.
- Limit "no multitouch" on the Pi vs fbdev: fine, but check against `kms.cpp` before release.

## Suggested pages
- API/reference: display-gl options, environment, zgl.h
- Guide: Choosing a renderer (cpu, gl, auto)
- Steps: Write a GPU layer under the UI
- Explanation: How a frame is composed (overlay, key colour, layers)
- Notes: Raspberry Pi 3B+ measurements, Limits, Troubleshooting
- Examples: mapper, 3D cubes
