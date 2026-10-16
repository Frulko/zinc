---
id: ZN-741
title: 'GLES 2 base: one capability record, context providers, GPU tuning'
status: Backlog
assignee: []
created_date: '2026-10-16 12:41'
updated_date: '2026-10-16 14:04'
labels:
  - mobile
  - gl
  - perf
  - size-L
milestone: m-26
dependencies:
  - ZN-622
ordinal: 196500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: the Pi 3 (VideoCore IV), the HP TouchPad (Adreno 220) and the Nexus 7 2012 (Tegra 3) share one problem, GLES 2 only on little memory, which most Android devices do not have: one generic base with platform specifics, split by capability, not by platform. Design: docs/reports/zinc-next-mobile-core.md §4.1 (Tegra 3 measures). (1) A capability record filled once per GLES/GL context (version, fragment highp, surface and FBO depth/stencil bits, max texture, NPOT, VAO, instancing, 32-bit indices, framebuffer fetch, discard, compressed formats, renderer string, tiler or not), read by runtime/gl_replay.cpp and plugins/display-gl instead of the probes spread over kms.cpp, display_gl.cpp and gl_replay.cpp; model: sokol sg_features/sg_limits, bgfx BGFX_CAPS_*, Impeller Capabilities. (2) A tuning table keyed by GPU family for what capabilities do not say (atlas size, render scale, clear and FBO policy, frame cap), with ANGLE features / Chrome's GPU driver bug list as the model for renderer-string workarounds. (3) Context providers only per platform: KMS/EGL (kms.cpp), webOS SDL 1.2 (webos.cpp), SDL3 (hal_sdl.cpp, desktop and Android); the SDL3 window on Android drives the GLES 2 replay. (4) A device class from the record and SDL_GetSystemRAM (heap budget, glyph and image caches, render scale). (5) mediump-safe shaders: coverage and distance math relative to the primitive, so Tegra 3 (no fragment highp, 13-bit mediump) draws like the desktop within tolerance. Reuse, do not rewrite: the GLES 2 path of gl_replay, glslang for ES 1.00 validation, GLAD for loading, SDL3 for contexts and events.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rn-showcase and hero on the Nexus 7 through the GLES 2 replay in the SDL3 window, frame times against the software raster in docs/reports/zinc-next-perf.md
- [ ] #2 one capability record replaces the three probe sites; ZINC_GL_INFO prints it on every provider
- [ ] #3 a mediump-only shader build (forced on the desktop) draws the GL goldens within the existing tolerance
- [ ] #4 the Pi 3 and TouchPad runs are one line each under Cross-platform pass in backlog/later.md, or measured if the device is on the bench
- [ ] #5 a T0 test of the record and the tuning table (fake GL strings of VC4, Adreno 220, Tegra 3, desktop)
- [ ] #6 the layer builds as its own CMake target that links nothing of the runtime (checked by the T0 test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
D119 (owner 2026-10-16): keep our own layer, written to be extractable later as a project of its own (own directory and CMake target, C ABI, no dependency on the runtime beyond the command-list header, its own tests), because back ends for CHIP, PS Vita (GXM), 3DS (citro3d), Wii (GX), Wii U (GX2), Switch (deko3d/NVN) are planned. Do not extract it in this task; keep the boundary.

2026-10-16, measured by the Android chain (ZN-622, docs/reports/zinc-next-android.md): the GLES 2 replay already drives the SDL3 window on Android (ZINC_RENDERER=gl) with correct pixels but is SLOWER than the software raster on Tegra 3 (rn-showcase 13.7 fps, present p50 89 / p99 158 ms; breakout present p99 32.8 ms) because it replays the whole frame while the raster redraws only the damage. So this task must make the replay damage-aware (scissor to the damaged rectangles over a preserved back buffer: EGL_SWAP_BEHAVIOR_PRESERVED, EGL_KHR_partial_update or EGL_EXT_buffer_age where the driver has them, else an FBO of the frame and a copy of the damage) before it can become Android's default; the software raster at idle is 60 fps, scrolling ~25 fps (raster ~23 ms + present ~13 ms).
<!-- SECTION:NOTES:END -->
