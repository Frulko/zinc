---
id: ZN-725
title: >-
  GLES 2 fast path of the GL replay: one program per mode, cheap antialiased
  edges (VideoCore IV)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-12 10:41'
updated_date: '2026-10-12 11:38'
labels:
  - perf
  - gl
  - size-L
milestone: m-21
dependencies: []
ordinal: 487410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request, 2026-10-12, with the Pi 3B+ plugged in: put the UI and the maps on the GPU of a GLES 2 tiler. Measured (docs/reports/raspberry-pi.md, last section): on VideoCore IV the GL replay takes 217 ms for hero's driving frame against 43 ms for the software bands, because one fragment shader holds every mode behind ifs (a GPU without branches runs all of them: 35 ms with one mode compiled in, ZINC_GL_ONLY) and because POLY's fringes are bounding-box quads with distance maths and discard (124 ms; ZINC_GL_FRINGE=0). Research: docs/reports/hardware/vc4-gles2-performance.md, docs/reports/gles2-2d-rendering-techniques.md. Device tool: next/tools/device (push, profile, shot, stacks). Desktop GL keeps its single program and its pixels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On GLES 2 every batch is drawn by a program compiled for its mode (ZMODE, without the gradient paint block unless a paint is set), compiled at first use; desktop GL is unchanged (its goldens and draw counts)
- [x] #2 tests/native/gl_replay_es2 checks every program variant as GLSL ES 1.00 with glslang
- [x] #3 The GLES 2 pixels of hero home, gallery and navigation are those of the single program (a capture before and after on the device or on a GLES 2 context of the Mac, tools/pngdiff)
- [ ] #4 POLY and STROKE edges on GLES 2 cost no distance maths per pixel over a bounding box: thin strips with the coverage in a vertex attribute, or 4x MSAA with plain triangles, chosen on measured numbers, the visible quality kept (captures compared with the software frame)
- [ ] #5 hero navigation driving on the Pi 3B+: present p50 below the software bands at the same clock (43 ms at 600 MHz, tools/device profile), home and gallery not slower than before; the first frame under 0.5 s
- [ ] #6 The mid-frame stalls VC4_DEBUG=perf reports (Blocking on resource BO for bo map) are attributed, and removed where the cause is the replay's (uploads into a texture or buffer in use, a clear after the first draw)
- [ ] #7 Numbers in docs/reports/raspberry-pi.md and docs/reports/zinc-next-perf.md; the default renderer of display-gl on GLES 2 follows them (gl when it wins, else cpu)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan (2026-10-12, worktree agent): the criteria in their order, each change kept only on a device number. Device: Pi 3B+ at 600 MHz (under-voltage, throttled=0x50005) for every number below; hero exported with ZINC_DISPLAY=gl, run with ZINC_RENDERER=gl, 200 frames, present p50 (tools/device profile).

#1 to #3, per-mode programs (runtime/gl_replay.cpp use_prog, key_of, run_of; gl_replay_shaders.h fs_source):
- GLES 2: one program per mode, one more with the gradient paint block, built at first use. A batch is still one vertex upload; it is drawn run by run (consecutive quads of one program), so paint order is kept. Attribute locations are fixed for every program (zgl_program binds a_pos, a_uv, a_box, a_par, a_c1, a_c2, a_z to 0..6 in display_gl.cpp and hal_sdl.cpp). Uniforms live in struct Prog: size and flip are set at a program's first use in a frame, the texture unit once, edge / paint / convex by the code that draws that mode, on the program use_prog returns.
- The shader source is assembled from one block per mode (fs_source): the #define ZMODE / ZNOPAINT hooks are gone. With the defines every program still took 90 to 110 ms to build on the Pi (the driver parses and optimises the whole ladder); a program built from its block alone takes 30 to 66 ms.
- Desktop GL (GLR_CORE): one program (the ladder of every block), one run per batch. Checked against the main tree's binary with ZINC_DISPLAY=gl ZINC_RENDERER=gl ZINC_DETERMINISTIC=1, 60 frames: hero 14.7 draw calls / 2331 quads, navigation 88.3 / 30134, canvas/sketch 71.0 / 2967, lottie-gallery 361.6 / 7519 on both, and the four captures byte-identical. gl_renderer, gpu_strokes, gl_replay_es2, gl_convex, gl_occlusion pass (--tier t1).
- ZINC_GL_ONLY=<mode> still works (GLES 2: every quad takes that mode's program; desktop: the single program built from that block).
- Numbers, before -> after: navigation driving 219.8 -> 82.3 ms (63.5 -> 117.9 draw calls a frame, 6509 quads), home 30.2 -> 22.7 (11.6 -> 75.3), gallery 42.0 -> 33 to 38 (86.1 -> 128.0), tasks 14.6 -> 14.6, settings 14.2 -> 14.3 (both idle 70% of the frames). First frame 2474 to 2687 ms -> 772 to 834 ms: about 420 ms to build 8 or 9 programs, and 174 to 329 ms in 160 to 200 glyph uploads (see #6).
- #2: tests/native/gl_replay_es2.cpp checks 26 programs with glslang (every mode with and without paint, the ladder with and without, occlusion, stencil) and that each source fits the replay's buffer.
- #3: frame 60 of navdrive, home and gallery captured on the Pi before and after (tools/device capture, new: ZINC_SHOT read back by the program, same frame at every run). Not byte-identical, and the difference is the single program's: home 105 pixels of 384000 differ (0.027%), 104 of them nearer to the software frame with the per-mode programs (the single program leaves stray pixels of a neighbouring quad on VideoCore IV, most on the 64-pixel tile boundaries), 1 as far; gallery 382 pixels (0.10%): 270 nearer, 69 as far, 43 farther by at most 7 levels (rounding in the gradient maths); navigation 1616 pixels (0.42%), 803 nearer, 670 farther, on the POLY fringes (ownership ties of the EDGE block, replaced in #4). Against the software frame (same build, ZINC_RENDERER=cpu, tools/glcompare, pixels over 24): navigation 0.226% -> 0.189%, home 0.070% -> 0.054%, gallery 0.055% -> 0.041%; largest difference 246 -> 163.
- Also: next/src/tc/plugin_build.cpp now counts gl_replay_shaders.h in a display plugin's key (a change of the shaders alone did not rebuild display-gl).

#1, one program per mode against program classes (the coordinator's question; on 2026-09-29 a split into three programs was slower, docs/plugins/display-gl.md): measured with ZINC_GL_GROUPS (new: "0,1,7;2;3,4" puts modes in one program behind a ladder), 150 frames, 600 MHz, present p50 in ms / draw calls a frame / first frame in ms:
- one program per mode (kept, the default): home 23.2 / 74, gallery 35.0 / 129, navigation 81.6 / 118; first frame 794 to 833
- UI core (FILL BORDER TEXT IMAGE SOLID RESTORE SHADOW) + vector (STROKE EDGE CONVEX): home 29.3 / 20, gallery 34.7 / 101, navigation 120.4 / 70; first frame 1168 to 1177
- SOLID alone + the rest of the UI + vector: home 22.7 / 57, gallery 35.3 / 120, navigation 100.5 / 88; first frame 997 to 1039
- boxes (FILL BORDER SHADOW) / TEXT / images / SOLID / vector: home 26.0 / 67, gallery 39.2 / 124, navigation 100.7 / 99
- boxes + SOLID / TEXT / images / vector: home 27.5 / 40, gallery 37.6 / 108, navigation 114.5 / 84
One program per mode wins or ties on every screen and builds fastest. What differs from 09-29: a program switch no longer ends the batch (one vertex upload, a draw call per run), so a switch costs a draw call, not an upload; and a pixel of the UI core pays two texture reads and three box distances. No GPU reset during the runs (dmesg, 0).

State of this commit: criteria 1 to 3. The RAMP mode and the strip geometry of #4 are in the file but off (ZINC_GL_STRIPS=1 turns them on, on desktop GL too); their numbers follow.
<!-- SECTION:NOTES:END -->
