---
id: ZN-725
title: >-
  GLES 2 fast path of the GL replay: one program per mode, cheap antialiased
  edges (VideoCore IV)
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 10:41'
updated_date: '2026-10-12 12:26'
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
- [x] #4 POLY and STROKE edges on GLES 2 cost no distance maths per pixel over a bounding box: thin strips with the coverage in a vertex attribute, or 4x MSAA with plain triangles, chosen on measured numbers, the visible quality kept (captures compared with the software frame)
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

#4, the edges of POLY and STROKE, measured on the Pi (600 MHz, navigation driving, present p50, 150 to 200 frames; ZINC_GL_MSAA=4 is a new switch of kms.cpp that takes a 4-sample window config, ZINC_GL_FRINGE=0 drops POLY's fringe passes):
- distance maths over boxes (the state of #1): 82.3 ms
- no antialiased POLY edge at all, strokes and convex polygons as strips (ZINC_GL_STRIPS=1 ZINC_GL_FRINGE=0), the floor: 35.1 ms
- 4x MSAA with that same geometry and no fringe pass (the "plain triangles" option): 57.3 ms; 4x MSAA with the strips too: 73.4 ms
- strips with the coverage in a vertex attribute, no MSAA: 46.8 ms (200 frames), 49.5 ms (150 frames)
MSAA costs 22 ms on this frame (every blended pixel reads and writes four samples, the tiles are 32 pixels), the strips' three fringe passes 12 to 14 ms: strips are chosen. MSAA would also antialias only the frames drawn straight into the window, not those drawn into the surface texture (no EXT_multisampled_render_to_texture on this driver).
- What the strips are (runtime/gl_replay.cpp, RAMP mode: coverage = w - |t| from the vertices): an opaque STROKE is one quad per segment across its width, corners shared on the bisector under 37 degrees of turn, a fan disc at sharper joins and at the ends; a translucent STROKE keeps the capsules (they blend each pixel once); a convex POLY of 3 to 8 points is its shape shrunk by half a pixel plus one quad per edge, without stencil; other POLYs keep stencil then cover with two half-pixel quads per edge (left, right) in place of the edge's box, the side chosen by drawing one array instead of a test per pixel.
- home 22.7 -> 18.4 ms with them, gallery 33 to 38 -> 36.5 (the same within the noise of the 33.3 ms step).
- Quality, frame 60 against the software frame (tools/glcompare, pixels over 24 / mean error): navigation 0.216% / 0.366 (boxes 0.189% / 0.360, the single program 0.226% / 0.387), home 0.063% / 0.098 (0.054 / 0.095; 0.070 / 0.101), gallery 0.048% / 0.153 (0.041 / 0.150; 0.055 / 0.158). On the Mac (ZINC_GL_STRIPS=1 on desktop GL against its own technique): shapes 0.986% both, navigation 0.422% against 0.421%, lottie-gallery 1.154% against 1.290%, svg-gallery 3.911% against 3.916%, hero the same pixels. What differs to the eye: nothing on the map at 4x zoom; hairline rings (lottie) are more even and a little lighter.
- Seen in every GL capture of the map, before this task too: single background-coloured pixels inside some POLY fills (the software frame has none). Not from the strips; not investigated here.
- Not under the software bands yet (43.3 ms): 46.8 to 49.5. The frame's CPU side is now the larger part (31 to 54 ms "to submit", which includes 2.5 to 4 ms a frame of glyph uploads that stall, #6).

#4, correction (600 MHz): the MSAA runs above were taken while a second hero-gl was still drawing behind them (a program that gdb was sampling for tools/device stacks kept running after the tool's kill; the tool now kills again with -9). Taken again with the board to themselves, navigation driving, 150 frames, present p50: boxes with distance maths 88.9 ms; no fringe at all 34.0; 4x MSAA with plain triangles and no fringe pass 53.7; strips 44.9; MSAA and strips 73.6. Same conclusion: MSAA costs 20 ms on this frame, the strips 11, the strips are kept. (The 46.8 ms of the commit message was a clean run; its 57.3 for MSAA is the disturbed one: 53.7.)

VALIDITY OF THE NUMBERS ABOVE (2026-10-12 13:50): every device number above this line was taken at 600 MHz AND under a 53% CPU load: tools/device never stopped anything (its pattern for ~/zn/* was quoted: fixed on main in 036a084d, taken here), so a museum-table program on the software renderer ran beside every GL run, and during the MSAA series a second hero-gl too. The software reference of 43.3 ms was taken without that load. Read them as relative steps under a load, not as results.
New supply, reboot at 13:50. tools/device status: "cpu: 4 cores, 1400 MHz now, 1400 MHz max, governor ondemand; firmware: frequency(48)=1400000000, throttled=0x50000, temp=52.1'C". 0x50000: under-voltage and throttling have occurred since this boot (bits 16 and 18), none now (bits 0 to 2 clear). Nothing else runs under ~/zn (status lists none). Clean series at 1400 MHz follow.

CLEAN SERIES 1 (14:00, nothing else running, tools/device fixed; 200 frames; present p50 in ms; the clock is the one the run ended at). The new supply sags under a four-thread load: the software bands end at 600 MHz with throttled=0x50005, the GL runs stay at 1400 MHz: a real effect on this board, not a like-for-like clock.
- software bands (fbdev build, --offscreen): navigation driving 42.4 (600 MHz, 0x50005; raster 40.7 + convert 1.7, no vsync wait off screen); home 13.4, gallery 11.2, tasks 15.0, settings 14.7 (1400 MHz; these wait for the vsync: home's raster is 3.9 ms, gallery's 8.6)
- the single program (hero-gl0, the build before this task): navigation 180.8 (1400 MHz), home 31.6 (ended at 700 MHz), gallery 31.3, tasks 15.6, settings 15.4; first frame 1073 to 1150 ms; 63.5 / 11.6 / 86.1 draw calls a frame
- per-mode programs + strips (commit e32f93ba): navigation 29.6 (1400 MHz, 115 draw calls, 10838 quads, 14.6 ms of CPU to submit), home 14.9 (75 draw calls), gallery 24.3 (128), tasks 15.6; first frame 289 to 297 ms (replay 231 to 235 ms)
- The Pi stopped answering during the next run (hero-gl settings, 14:05: ssh timeout, then the name no longer resolves). Cause not known yet (the supply, or the GPU hang recorded in docs/plugins/display-gl.md): checked when it is back.

CLEAN SERIES 2 (14:15, 1400 MHz supply that holds, board to itself, cool before each run; 200 frames, present p50 in ms). Reading the clock: `vcgencmd measure_clock arm` after a run shows what the ondemand governor chose for an idle CPU (600 to 1000 MHz after a light GL run), so a run is discarded on the throttling word (bits 0 to 3), not on that reading.
- software bands, off screen: navigation 19.2 (raster 17.8; the run ends at 59 C with the soft temperature limit set, 0xd0008, clock 1200: four busy cores take the bare board from 54 C to the limit in five seconds; the coordinator's run of 500 frames gave 18.7), home 14.9 (raster 2.0, the rest waits for the vsync), gallery 14.1 (raster 3.9)
- the single program (hero-gl0): navigation 181.1, home 31.0, gallery 32.8; first frame 1081 to 1126 ms
- per-mode programs + strips (commit e32f93ba): navigation 29.7 (115 draw calls, 10838 quads, 14.8 ms of CPU to submit; 53 C before, 54 C after), home 14.8, gallery 24.3 (24.2 ms to submit); first frame 289 to 305 ms
So at this clock: navigation 181 -> 29.7 ms and its first frame 1.1 s -> 0.29 s, but the software bands on four cores (19 ms) are ahead of the GL path on navigation and gallery; home is the same (both at the vsync).

#6, attribution (VC4_DEBUG=perf with the new ZINC_GL_TRACE=1, which prints a line before each texture upload, framebuffer copy and clear of the replay; 60 frames, "Blocking on resource BO for bo map"):
- before: navigation 22, home 26, gallery 45 blocks. Cause 1, a glTexSubImage2D per new glyph into the atlas, each one after draws of the same frame: the driver submits the frame so far and waits for the GPU (1.9 to 3.7 ms a glyph at 600 MHz; 300 ms of the first frame).
- fix: on GLES 2 a glyph goes into a copy of the atlas in memory; the rows that changed are uploaded once, before the frame's first draw (frame() looks the TEXT commands' glyphs up first), or before the next draw when a glyph comes late (a TEXT under a matrix).
- after: navigation 10, home 18, gallery 39. Every one left follows a call the trace names: the atlas upload at the start of a frame that brings new glyphs (10 / 18 / 13: the texture is still sampled by the previous frame, so the call waits for that frame's GPU work, once; time the swap would wait for otherwise), and in gallery 26 follow the copy of a rounded CLIP's corners from the framebuffer (glCopyTexSubImage2D, two rounded clips a frame: each read ends the driver's job, so the frame is drawn as three jobs, each loading and storing its tiles; "job throttling" 84 times against 34 to 41 on the other screens). Not removed: it needs a rounded clip that does not read the framebuffer (line for later.md).
- No "Flushing rendering to process new clear" and no "Partial clear" line on these screens: the replay's clear is the frame's first call and no CLEAR command comes after a draw there.

CLEAN SERIES 3 and 4 (14:25 to 14:55, 1400 MHz, throttled=0xd0000 after every run kept, board under 55 C before each; the full tables are in docs/reports/raspberry-pi.md, last section):
- #4 re-checked on clean numbers, navigation, present p50: boxes with distance maths (ZINC_GL_STRIPS=0) 65.2 ms; no fringe at all 19.2; 4x MSAA with plain triangles and no fringe pass 35.5; 4x MSAA with the strips 44.3; strips 29.7. Strips stay.
- stencil path in five draw calls instead of seven (the write that marks a drawn pixel also clears its winding, the cover zeroes the rest): navigation 29.7 -> 25.0 ms (115 -> 103 draw calls), gallery 24.3 -> 22.8. Kept.
- glyph atlas uploaded once a frame: the p50 does not move; 12, 8 and 6 fewer stalls in 60 frames (navigation, home, gallery), about 10 ms of the first frame. Kept.
- final build, present p50: navigation 25.0, home 14.8, gallery 22.8, tasks 15.6, settings 15.0; first frame 277 to 295 ms. Before the task: 181.1, 31.0, 32.8, 15.6, 15.4; 1081 to 1126 ms.
- the references at this clock: software bands (fbdev, off screen) navigation 19.1 (raster 17.7), home 14.9, gallery 14.1; display-gl with renderer cpu: navigation 62.2, home 14.9, gallery 13.8.
- CPU time of the whole program per frame (300 frames) and temperature over the run: navigation, bands 80.2 ms (289% of a core, 51 -> 58.5 C), GL 21.3 ms (56%, 53 -> 54.2 C), display-gl cpu 72.8 ms (99%); gallery 23.8 / 14.7 / 20.8 ms; home 12.5 / 11.5 / 11.5 ms. The GL renderer heats the bare board by 1 C where the bands add 7 C in eight seconds (the firmware's limit at 60 C then cuts the clock to 1200 MHz).
- ZINC_GL_TIME=1 on navigation: 33.6 ms a frame with a glFinish, 11.6 of them the CPU's: 22 ms of GPU work, so one vblank in two is missed (30 frames a second) whatever the CPU side does. Without any fringe the frame is 19.2 ms: the three fringe passes are the 6 ms that would have to go.
- pixels of the final build against the software frame (frame 60, pixels over 24 / mean error): navigation 0.217% / 0.360, home 0.063% / 0.098, gallery 0.048% / 0.153 (the single program: 0.226 / 0.387, 0.070 / 0.101, 0.055 / 0.158). No GPU reset in any run (dmesg).

#5: NOT MET for navigation: 25.0 ms against the bands' 19.1 ms at 1400 MHz (the bar the coordinator set after the new supply; at 600 MHz under the museum's load it was 44.9 against 43.3 unloaded). Met for the rest: home 31.0 -> 14.8 and gallery 32.8 -> 22.8 are faster than before, the first frame is 0.28 to 0.30 s.
#6: attributed (above, ZINC_GL_TRACE); the per-glyph uploads are removed; NOT removed: the framebuffer copy of a rounded CLIP's corners (26 of gallery's 39 blocks, the frame drawn as three driver jobs), and the atlas upload of a frame that brings new glyphs still waits for the previous frame (two atlas textures used in turn would avoid it).
#7: docs/reports/raspberry-pi.md has the section "The GLES 2 fast path of the GL renderer, measured"; docs/plugins/display-gl.md lists the switches; the lines for docs/reports/zinc-next-perf.md are in the agent's final report (that file is the coordinator's in a worktree). Decision on the default: display-gl keeps renderer "cpu" on GLES 2. "gl" wins navigation (25.0 against 62.2 ms) and halves the CPU everywhere, loses gallery (22.8 against 13.8 ms) and has had no long run on partially changing screens (the 2026-09-29 hang); a program with a map asks for it (ZINC_RENDERER=gl). For a program that needs no GPU layer the fbdev bands stay the fastest renderer of this board.

HANDOVER (task back to Backlog; #5, #6, #7 open):
- next step for #6 and gallery: a rounded CLIP on GLES 2 that does not read the framebuffer (run: SCREENS=gallery with VC4_DEBUG=perf ZINC_GL_TRACE=1, `tools/device <pi> profile hero-gl --frames 60 --raw ZINC_RENDERER=gl ZINC_DEMO=gallery VC4_DEBUG=perf ZINC_GL_TRACE=1`; the copies are in run(), case CLIP). When gallery is at the vsync, measure Kit and Forms for an hour under `timeout -s KILL` with the reset counter, then flip ZP_DISPLAY_GL_RENDERER to "auto" off __APPLE__ in plugins/display-gl/src/display_gl.cpp.
- for #5 the GPU has 22 ms of work on the map: the levers left are the fringe passes (6 ms: three passes over 8 vertices an edge; one indexed set of 3 vertices a point would cut the vertex work by 2.7) and geometry kept across frames (the MESH of docs/reports/gpu-renderer-design.md, phase 4).
- #7: tick when the performance log has its lines.
- tools/device: `capture <name> <file.bmp>` (a frame read back by the program), `stop` and the measures kill what is left running (main's fix 036a084d taken as is).
<!-- SECTION:NOTES:END -->
