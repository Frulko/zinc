---
id: ZN-741
title: 'GLES 2 base: standalone CMake target and the Android default decision'
status: Backlog
assignee: []
created_date: '2026-10-16 12:41'
updated_date: '2026-10-25 01:53'
labels:
  - mobile
  - gl
  - perf
  - size-L
milestone: m-26
dependencies:
  - ZN-622
ordinal: 52900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** AC1 hero numbers (needs ZN-628 video), AC4 later.md lines, AC6 own CMake target with no runtime dependency, AC7 second half: profile a replay pass on the Nexus 7 and decide the default. Already there: runtime/gl_replay.cpp; task notes 2026-10-16; docs/reports/zinc-next-android.md.

Owner 2026-10-16: the Pi 3 (VideoCore IV), the HP TouchPad (Adreno 220) and the Nexus 7 2012 (Tegra 3) share one problem, GLES 2 only on little memory, which most Android devices do not have: one generic base with platform specifics, split by capability, not by platform. Design: docs/reports/zinc-next-mobile-core.md §4.1 (Tegra 3 measures). (1) A capability record filled once per GLES/GL context (version, fragment highp, surface and FBO depth/stencil bits, max texture, NPOT, VAO, instancing, 32-bit indices, framebuffer fetch, discard, compressed formats, renderer string, tiler or not), read by runtime/gl_replay.cpp and plugins/display-gl instead of the probes spread over kms.cpp, display_gl.cpp and gl_replay.cpp; model: sokol sg_features/sg_limits, bgfx BGFX_CAPS_*, Impeller Capabilities. (2) A tuning table keyed by GPU family for what capabilities do not say (atlas size, render scale, clear and FBO policy, frame cap), with ANGLE features / Chrome's GPU driver bug list as the model for renderer-string workarounds. (3) Context providers only per platform: KMS/EGL (kms.cpp), webOS SDL 1.2 (webos.cpp), SDL3 (hal_sdl.cpp, desktop and Android); the SDL3 window on Android drives the GLES 2 replay. (4) A device class from the record and SDL_GetSystemRAM (heap budget, glyph and image caches, render scale). (5) mediump-safe shaders: coverage and distance math relative to the primitive, so Tegra 3 (no fragment highp, 13-bit mediump) draws like the desktop within tolerance. Reuse, do not rewrite: the GLES 2 path of gl_replay, glslang for ES 1.00 validation, GLAD for loading, SDL3 for contexts and events.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rn-showcase and hero on the Nexus 7 through the GLES 2 replay in the SDL3 window, frame times against the software raster in docs/reports/zinc-next-perf.md
- [x] #2 one capability record replaces the three probe sites; ZINC_GL_INFO prints it on every provider
- [x] #3 a mediump-only shader build (forced on the desktop) draws the GL goldens within the existing tolerance
- [ ] #4 the Pi 3 and TouchPad runs are one line each under Cross-platform pass in backlog/later.md, or measured if the device is on the bench
- [x] #5 a T0 test of the record and the tuning table (fake GL strings of VC4, Adreno 220, Tegra 3, desktop)
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

2026-10-16 (second worktree agent), step 1: the GLES 2 programs are built while the screen rests. glr::warm() builds the next command program not built yet (the common modes first, then the lean ones when on), one per frame without damage (hal_sdl.cpp's GLES 2 idle branch, display-gl's idle frames). Nexus 7, rn-showcase (the new shell of 19:09), ZINC_GL_STATS: every program is built by frame 4; on the first run after an install the image programs take 60 to 70 ms each, stroke 36, edge 42, convex 29, the others 2 to 3 ms; on later runs Tegra's driver cache makes them all 2 to 4 ms. Tab switches (five taps): the worst present is 37.8 ms at the first switch (was 146.6 ms with the programs built at first use); the switches now cost the app's effects and layout (30 to 118 ms and 22 to 91 ms on the new Components and Forms screens), on both renderers: GLES 2 p99 42.1 ms, 26 late of 450; software p99 46.2 ms, 32 late of 450. Also fixed on the way: rn-showcase did not export for Android (links.ts, Promise.reject in a Promise<void> function: the checker's NeverPromise conversion knew Promise<T> only; commit 388d01c7).

2026-10-16 (second worktree agent), step 2: the capability record, the tuning table, mediump-safe shaders.
- runtime/gl_caps.h (namespace glcaps, no GL call, header only): the record filled once per context from the driver's strings and limits (version, family from the renderer string, fragment highp and mediump bits, surface depth/stencil, max texture, npot, VAO, instancing, 32-bit indices, framebuffer fetch, derivatives, depth24, packed depth-stencil, ETC1/S3TC/ASTC, half floats, EGL buffer age / partial update / swap with damage) and the tuning table by family (tiler, lean programs), the way ANGLE's features and Chrome's driver bug list key workarounds. glr::probe() asks the driver once; the providers give their EGL extensions first (hal_sdl on Android through SDL_EGL, display-gl's kms.cpp through zgl_backend_egl, a weak hook). It replaces the probes of gl_replay.cpp (packed depth-stencil, depth24, ETC1), display_gl.cpp (max texture), kms.cpp (print_info, removed) and webos.cpp (its own extension print and the ZINC_GL_LEAN setenv: the Adreno 2xx row of the table says it now). ZINC_GL_INFO prints the record on every provider (checked: the SDL3 window on macOS and on the Nexus 7, display-gl's SDL provider on macOS; KMS and webOS by code, cross-platform pass).
- Tuning rows: tilers (VC4, Adreno, Mali, PowerVR, Apple): the window is cleared before the full-window quad; immediate GPUs (Tegra 3, desktops) skip that clear (Tegra 3: the window draw 5.4 -> 4.2 ms). Lean programs on Adreno 2xx (TouchPad measure) and Tegra 3 (a fling: 498 -> 386 late frames of 720 with the GPU scroll, p99 35.0 -> 32.2 ms).
- Mediump-safe shaders (gl_replay_shaders.h VS): the fragment shaders read positions relative to a whole pixel of the quad's own primitive (the box centre floored, a segment's start; CONVEX's edge equations moved to the quad's corner on the CPU), not to the surface: 13-bit Tegra 3 mediump keeps fractions of a pixel, and a primitive moved by whole pixels gets the same values (ZN-744's GPU scroll). Quads under a gradient paint keep absolute positions (ZN_PAINT on GLES 2, u_g0.w on desktop GL). STROKE and EDGE quads start and end on whole pixels.
- AC3: ZINC_GL_MEDIUMP=<bits> rounds the positions a fragment reads to that many mantissa bits (the arithmetic after them keeps its precision: a partial model, stated in the shader). tests/t1/gl_renderer passes with ZINC_GL_MEDIUMP=13 (Tegra 3) and 10 (fp16 GPUs); hero against the software frame: 0.186% of pixels over 24, mae 0.159 at full precision, 13 and 10 bits alike, mae 0.171 at 7 bits (the emulation is live).
- AC5: tests/t0/gl_caps.sh builds tests/native/gl_caps.cpp alone (CMake target gl_caps_test, no library linked, the script refuses one): VideoCore IV (Mesa vc4), Adreno 220 and 320, Tegra 3 (the Nexus 7's real extension string), Apple, Intel, llvmpipe.
- Nexus 7 record: OpenGL ES 2.0, NVIDIA Tegra 3 (family Tegra 3); fragment highp no, mediump 13 bits; surface depth 16 stencil 8; max texture 2048; npot 0 vao 0 instancing 0 uint-index 0 fb-fetch 1 derivatives 1 depth24 0 packed-depth-stencil 0; etc1 1 s3tc 1 astc 0 half-float 1; egl buffer-age 0 partial-update 0 swap-damage 1 (no preserved swap either: eglSurfaceAttrib refused); tuning tiler 0, lean 1.
- AC7 (default): measured in alternation on the Nexus 7, rn-showcase Components screen, ten scripted flings, perf panel on, with ZN-744's GPU scroll: GLES 2 late frames 225 / 228 / 285 of 720, interval p99 32.1 / 31.6 / 32.5 ms; software raster 228 / 222 / 263, p99 29.4 / 26.8 / 28.3. Tab switches 23 vs 20 late of 450 (p99 42.5 vs 39.7, the screens' effects and layout dominate); at rest 1 vs 0 of 230. Panel off: GLES 2 221 late, p99 29.5; software 270, p99 31.5. As fast at rest and in a tab switch, a few ms behind in a fling with the panel on: Android keeps the software raster (the owner's bar includes the fling). What remains is the replay of the rectangles, 1 to 3 ms of A9 CPU per pass and about 70 ns of GPU a pixel of a strip; the software raster draws the same strip in about 1 ms.
- AC6 not done: the record is its own target, the replay (gl_replay.cpp) is still included by its users and reads the runtime's fonts, glyphs and images (zrt_raster.h); making it a target needs those behind the command-list header first.
- AC1: rn-showcase measured (above, numbers for the coordinator's perf log); hero still does not export (ZN-628).

Decision text (for the coordinator's record, ZN-741/ZN-744): on Tegra 3 the GPU replay is slower per pixel than the four A9 cores rasterizing (a strip of cards: 4.5 ms GPU vs about 1 ms CPU) and texture uploads run at about 100 MB/s, so the GLES 2 path wins only by drawing less: a scroll keeps the scrolled area's rows turned in the frame texture (nothing moves) and replays the strip that came in and the rectangles diff_move names; Android's default stays the software raster until the replay of those rectangles costs less than 1 ms a pass. Scored (RULES §4, fit x3, perf x3, size x2, maint x2, licence x2, portability x1, effort x1): rows turned in place 4,4,5,4,5,5,3 = 66; pixels moved through a scratch texture 4,3,5,4,5,5,4 = 63; a layer of the whole content in tiles 4,4,2,2,5,5,1 = 51; software raster with a GPU compositor 3,1,5,3,5,4,4 = 47 (uploads). Revisit with a GPU whose replay beats its CPU (Mali, Adreno 3xx+) or a per-pass cost under 1 ms.

Lines for backlog/later.md:
- ZN-741: Cross-platform pass: ZINC_GL_INFO on the Pi 3 (KMS, display-gl) and the TouchPad (webOS): the record's family and tuning (VideoCore IV a tiler without lean, Adreno 220 with lean: the webOS setenv is gone, the table says it).
- ZN-741: the replay as its own CMake target (D119, AC6): fonts, glyphs and images reached through the command-list header instead of zrt_raster.h's globals.
- ZN-741: the webOS platform defaults ZINC_GL_DIRECT=1 and ZINC_GL_CORNERS=0 belong in the tuning table (Adreno 2xx row), measured there first.
- ZN-741: fp16-only GPUs (Mali-400 on the CHIP): positions relative to the box centre lose a quarter pixel on 400 px boxes at 10 bits; relative to the nearest corner in bands would keep them (ZINC_GL_MEDIUMP=10 to see it).
- ZN-741: GL_OES_get_program_binary or the driver's cache: the first run after an install builds the image programs in 60 to 70 ms each on Tegra 3 (warm() hides it at rest).

Handover (2026-10-16 late): open AC1 (hero: ZN-628), AC4 (the coordinator adds the later.md lines), AC6 (the replay as its own target), AC7 second half (Android default: the fling is 3 to 4 ms behind the software raster at p99). Next: profile a replay pass on the Nexus 7 (ZINC_GL_MOVE_LOG=2 prints each pass CPU and GPU time; 1 to 3 ms of A9 each), then compare again with the scripts in /tmp/zn744 (FLING=fling-c.txt sh pair.sh s 900 2 170 890 "gl:ZINC_RENDERER=gl" "cpu:").
Review 2026-10-25: done-partly. Capability record, tuning table and mediump build are done and tested; open: hero timings, the later.md lines, the replay as its own CMake target, and the Android-default decision (the fling is 3-4 ms behind the software raster at p99). Evidence: runtime/gl_replay.cpp; task notes 2026-10-16; docs/reports/zinc-next-android.md
<!-- SECTION:NOTES:END -->
