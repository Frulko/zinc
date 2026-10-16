---
id: ZN-741
title: 'GLES 2 base: one capability record, context providers, GPU tuning'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-16 12:41'
updated_date: '2026-10-16 14:07'
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
- [ ] #7 the GLES 2 replay is damage-aware: a frame without damage is not replayed, a partial change replays only the damaged rectangles over a preserved back buffer (buffer age / partial update / swap-preserved, else an FBO of the frame); on the Nexus 7 it is at least as fast as the software raster at rest and in a tab switch, then becomes Android's default
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
D119 (owner 2026-10-16): keep our own layer, written to be extractable later as a project of its own (own directory and CMake target, C ABI, no dependency on the runtime beyond the command-list header, its own tests), because back ends for CHIP, PS Vita (GXM), 3DS (citro3d), Wii (GX), Wii U (GX2), Switch (deko3d/NVN) are planned. Do not extract it in this task; keep the boundary.

2026-10-16, measured by the Android chain (ZN-622, docs/reports/zinc-next-android.md): the GLES 2 replay already drives the SDL3 window on Android (ZINC_RENDERER=gl) with correct pixels but is SLOWER than the software raster on Tegra 3 (rn-showcase 13.7 fps, present p50 89 / p99 158 ms; breakout present p99 32.8 ms) because it replays the whole frame while the raster redraws only the damage. So this task must make the replay damage-aware (scissor to the damaged rectangles over a preserved back buffer: EGL_SWAP_BEHAVIOR_PRESERVED, EGL_KHR_partial_update or EGL_EXT_buffer_age where the driver has them, else an FBO of the frame and a copy of the damage) before it can become Android's default; the software raster at idle is 60 fps, scrolling ~25 fps (raster ~23 ms + present ~13 ms).
2026-10-16 (worktree agent), part 1: the damage-aware GLES 2 replay in the Android window (AC7's first half).
- runtime/gl_replay.cpp: glr::dmg_default, the includer's choice when ZINC_GL_DMG is not set (display-gl keeps it off: the scissored replay is the suspect of the Pi 3B+ GPU resets, docs/plugins/display-gl.md).
- targets/macos/hal_sdl.cpp, GLES 2 only (Android, ZINC_RENDERER=gl): the frame's damage box alone is replayed into the replay's texture, which keeps the frame (the preserved back buffer is the FBO of the frame: Tegra 3 has neither EGL_KHR_partial_update nor buffer age; the copy to the window is one textured quad); a frame without damage draws and posts nothing (the window keeps its last buffer) and sleeps to the next 16.7 ms; the straight-into-the-window path is not taken on GLES 2 (it loses the texture).
- Correct pixels after tab switches and a detail page (screenshot /tmp/zn743/out/g-gl-shot.png).

Measured, Nexus 7, rn-showcase (trace frames 60 to the end; ZINC_PERF_HUD, ZINC_PROFILE on), damage-aware GLES 2 replay against the software raster (ZN-743's direct path):
- at rest: interval p50 16.66 p99 17.15 ms both (1 late frame of 230 each);
- tab switches (ZINC_INPUT taps on the tab bar, five switches): GLES 2 p99 17.4 ms, 5 late of 450, max 146.6 ms (the first use of a program: GLES 2 builds one per mode at its first quad); software p99 18.6 ms, 10 late of 450, max 47.8 ms;
- fling: GLES 2 p99 127.4 ms, 147 late of 830 (a scroll damages the whole feed: the full replay costs Tegra 3 90 to 130 ms); software p99 75.7 ms, 196 late of 830.
Before (ZN-622): the GLES 2 replay of every frame, 13.7 fps, present p50 89 ms.
Default not changed: at rest and in a tab switch the replay is at least as fast as the software raster now (AC7's condition), but a scroll is worse at the tail; Android keeps the software raster until the scrolled content is a layer the GPU only moves (ZN-744's GPU half). Command to compare: ZINC_RENDERER=gl in zinc.env, ZINC_INPUT taps or fling.

Not done in this session (handover): AC1 hero (does not export, ZN-628), AC2 and AC5 (the capability record and the tuning table replacing the probes of kms.cpp, display_gl.cpp, gl_replay.cpp, ZINC_GL_INFO), AC3 (mediump-only build drawing the GL goldens), AC6 (the layer as its own CMake target), AC7's second half (Android's default). A first entry of the tuning table exists in another form: zinc:gfx shaderProgram's scale (ZN-746) lets Tegra 3 shade the lava lamp at a quarter of the resolution.

Lines for backlog/later.md:
- ZN-741: Cross-platform pass: the damage-aware replay on the Pi 3 (display-gl: ZINC_GL_DMG=1 was the suspect of GPU resets on the 3B+, test it again with the FBO of the frame) and the TouchPad (Adreno 220).
- ZN-741: GLES 2 builds a program per mode at its first quad: the first tab switch of rn-showcase on a Nexus 7 takes 147 ms; build the programs of the common modes at start or on a worker context.
<!-- SECTION:NOTES:END -->
