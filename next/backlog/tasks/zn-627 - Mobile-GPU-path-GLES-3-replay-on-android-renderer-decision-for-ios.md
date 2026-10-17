---
id: ZN-627
title: 'Mobile GPU path: GLES 3 replay on android, renderer decision for ios'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:07'
updated_date: '2026-10-17 00:17'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-741
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`gl_replay` on a GLES 3 context on Android; on iOS measure the software raster through Metal, GLES through EAGL and (if needed) ANGLE, and decide (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frame times of rn-showcase and hero on both in `docs/reports/zinc-next-perf.md`
- [ ] #2 pixels equal to the desktop GL goldens within the existing tolerance
- [ ] #3 a decision record for iOS
- [x] #4 the iOS decision follows D119: our own Metal back end of the command lists, scored against GLES through EAGL and ANGLE on Metal for the record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner): the Nexus 7 is GLES 2 only, so the Android GLES path is ZN-741's GLES 2 base; this task keeps GLES 3 for capable Android devices and the iOS decision. The 2026-09 scoring (docs/reports/parity/04-library-choices.md §2.10, ui-rendering-architecture.md §2.11) rejected bgfx for its shader tool chain when GLES 2 and Metal were not both required; now they are.

2026-10-16, later: the owner kept our own layer (D119); bgfx is not re-scored.

2026-10-17, step 1 (worktree agent): iOS presents without the texture upload. targets/macos/hal_metal.mm (new, iOS only): the window is made with SDL_WINDOW_METAL and no SDL_Renderer, the raster draws the damaged rows straight into a shared MTLBuffer (fb), each damaged frame is one GPU blit of it into the CAMetalLayer's drawable (BGRA8Unorm, opaque, framebufferOnly NO, aspect-fit gravity); the raster waits for the previous blit before writing (p99 <= 0.12 ms); a frame without damage presents nothing (the layer keeps it, the CADisplayLink paces). ZINC_PRESENT=texture keeps SDL_Renderer. hal_sdl.cpp, all inside SDL_PLATFORM_IOS except from_window/to_window's no-renderer no-GL branch (reached only on iOS; it maps window points to the surface aspect-fit, as SDL's logical presentation did): the window creation, alloc_surface (fb = the buffer), present_frame, hal_shutdown. The macOS preprocessed HAL is unchanged except __LINE__ values. CMake: hal_metal.mm in zn_app_host and the window sources on iOS, Metal and QuartzCore linked. Test: tests/t0/ios_present.sh (hal_sdl.cpp and hal_metal.mm compile for arm64-apple-ios16.3-simulator, -Wall -Wextra -Werror).
Measured on an iPhone 17 simulator (iOS 26.3, Release, ZINC_PRESENT_STATS, machine shared with other agents' builds at load 8-19): rn-showcase, 2 s rest + ten 400 pt flings + five tab switches (ZINC_INPUT, 1200 frames): texture (2 runs) raster p50 0.73-1.08, move 0.78-1.07, upload p50 6.61-7.47 p99 9.96-13.90, swap 0.25-0.28, interval p50 16.63-16.72 p99 18.26-20.73 ms, app CPU 5.34/5.52 s over 22 s; Metal (4 runs) raster p50 1.04-2.74, move 0.98-1.63, upload 0, draw 0.07-0.08 + wait 0.01-0.04, interval p50 16.64-16.71 p99 17.22-18.66 ms, app CPU 3.82-4.54 s. Main thread per drawn frame ~9.3 -> ~3.5 ms. At rest (10 s): 0.61/0.74 -> 0.16/0.17 s of CPU. hero (title screen, animating, 15 s): texture raster p50 1.75-3.92, upload p50 5.94-7.26 p99 8.89-11.14, interval p99 18.27-18.80; Metal raster p50 2.52-5.37, draw 0.06-0.09, interval p99 17.40-18.86 ms. The raster's own time rises ~1 ms on the Metal path; not the buffer's memory (a malloc'd frame + a copy of the damaged rows into the buffer, tried and dropped: raster 1.16-1.80 + copy 0.38-0.48 ms), most likely the host scheduler with 7 ms less work a frame. Pixels: simctl screenshots of the first screen and of the end of the scripted session are byte-identical on both paths; mid-session the More tab shows (taps went through). A no-copy buffer over malloc'd memory (newBufferWithBytesNoCopy) ended the app on the simulator at start; dropped. Report: docs/reports/zinc-next-ios.md 'The present'. macOS: the desktop window presents with the GL replay; only ZINC_RENDERER=cpu, transparent windows and display plugins use SDL_Renderer there (later.md line).

2026-10-17, step 2: the decision record for iOS's renderer. This is the text for the coordinator, who gives it its number in zinc-next-decisions.md.
Question: what draws a Zinc app's frames on iOS, and which GPU back end does the command-list replay get there? The options are scored per RULES §4 (fit x3, performance x3, size x2, maintainability x2, licence and supply risk x2, portability x1, effort x1; 70 at most):
- A. Our own Metal back end of the command lists (D119): 5,5,4,3,5,3,2 = 59. It is the layer D119 keeps and follows Flutter's Impeller (Flutter moved from GLES to Metal on iOS). It uses no deprecated API and fits Apple's tile GPUs, with depth and stencil in tile memory. Its cost is a second back end beside GL to keep in pixel parity (about 1,200 to 1,500 lines plus the shader translation; plan below). It is Apple only, but it would also replace the deprecated OpenGL replay on macOS.
- B. The GLES 2 replay (ZN-741) through EAGL: 2,3,5,4,3,3,5 = 47. The code exists and is the Android and Pi code. But OpenGL ES has been deprecated on iOS since iOS 12 (2018); Apple's driver runs it on top of Metal, it gets no new features, and Apple could remove it. The supply risk is Apple's.
- C. ANGLE on Metal (GLES 3 over Metal, what WebKit uses): 3,3,1,2,5,4,3 = 41. It keeps one GL back end. But libGLESv2 and libEGL are several MB per architecture, with their own gn build to vendor (size scored 1; D119 already rejected ANGLE for size), and it adds a translation layer on the CPU for every draw.
- D. The software raster with the zero-copy Metal present (step 1, now the default): 4,4,5,5,5,3,5 = 62. Measured on the simulator: about 3.5 ms of main thread per drawn frame (raster and blit), nothing at rest, and pixels identical to the SDL_Renderer path. It is about 70 lines and gives the same pixels as every target. Performance is 4, not 5, for three reasons. A frame that changes everywhere costs a full raster (hero: 2.5 to 5.4 ms p50 on the Mac's cores). It is unproven at 120 Hz (ProMotion, 8.3 ms a frame) and on the oldest supported phone (iPhone 8, A11). And SHADER commands (D124) fall back to the program's CPU picture.
Choice: iOS ships D, the software raster through the zero-copy Metal present, as its default. Its GPU path is A, our own Metal back end of the command lists, as D119 asks. B and C are rejected and scored only for the record (B is deprecated, C is too large). A reuses D's CAMetalLayer, device and queue (hal_metal.mm). A gets built when any of these happens: a device measure shows D missing frames (60 Hz on an A11, or 120 Hz on ProMotion), programs need SHADER commands drawn on the GPU on iOS, or macOS's OpenGL replay needs a successor.
Why no Metal spike here: the simulator runs Metal on the Mac's GPU through its own driver, so a replay timed there says nothing about an iPhone's GPU. D126 showed that the choice depends on a device's cost per pass, and only a device can measure that.
Evidence: step 1's numbers (docs/reports/zinc-next-ios.md "The present"); the deprecation of OpenGL ES in iOS 12 (Apple's iOS 12 release notes, WWDC 2018); Flutter's Impeller on Metal (docs.flutter.dev/perf/impeller); ANGLE's Metal back end, used by WebKit (chromium.googlesource.com/angle/angle); D119, D124, D126.
Revisit when Apple removes OpenGL ES (B leaves the table), when ANGLE ships as a small prebuilt library, when a device shows D holding 120 Hz everywhere (A can wait longer), or when A grows past twice the lines of the GL back end.

The plan for the Metal back end. It is not built: it is an L task of 4 to 5 sessions.
1. Split runtime/gl_replay.cpp (1,969 lines, 257 GL calls) into two parts. runtime/replay_batch.h becomes the API-agnostic batcher: the vertex layout V/SV, quad building, glyph atlas packing, the corner texture, clip and occlusion order, damage rectangles and diff_move. The rest stays as the GL back end. The batcher calls a small table of back-end functions: texture create and update, atlas rect upload, draw a run of one program, scissor, stencil fill begin and end, clear, depth. The existing GL tests prove the split when they pass unchanged (gl_renderer, gl_scroll, shader_gl, window_renderer). One session.
2. runtime/mtl_replay.mm, the Metal back end. Pipelines: one MTLRenderPipelineState per mode, as the GLES 2 path has one program per mode (ZN-725), plus the stencil and occlusion pipelines. Vertices: a ring of three shared MTLBuffers behind a dispatch_semaphore, for the frames in flight. Textures: runtime images and the atlas in shared textures updated with replaceRegion, baked images in private textures filled by a blit. Depth and stencil are memoryless (tile memory, no bandwidth). Rectangular clips use scissor rects. The frame is replayed into a persistent BGRA texture, loading it so that only the damaged rectangles are drawn (D126's damage-aware replay), then blitted into the drawable as hal_metal.mm does now; when the whole frame changed it is drawn straight into the drawable. A Metal capability record sits beside runtime/gl_caps.h (GPU family from supportsFamily Apple4 to Apple9, the maximum texture size, memoryless support). Two to three sessions.
3. Shaders. At build time, gl_replay_shaders.h (GLSL ES 1.00) goes through glslang (vendored) to SPIR-V, then through SPIRV-Cross (to vendor: Apache-2.0, pinned) to MSL. The result is a generated runtime/mtl_replay_shaders.metal kept in the tree, with a T0 test that regenerates and diffs it. Xcode compiles it into the app's default.metallib, so nothing compiles at start. D124's runtime shaders: at run time, the program's GLSL ES fragment goes through glslang and SPIRV-Cross, then newLibraryWithSource, cached by hash in Library/Caches. glslang and SPIRV-Cross are linked only into apps whose program calls shaderProgram (the export knows which); otherwise SHADER keeps its CPU picture. One session.
4. Tests on the development Mac. The same back end runs on macOS (MTLCreateSystemDefaultDevice, headless into a texture) and is compared with the desktop GL goldens within the existing tolerance. Then a simulator smoke run of rn-showcase and hero: a few frames and one hash.

2026-10-17, step 3 and handover. AC1: the iOS half is in these notes (step 1: rn-showcase and hero frame times on the iPhone 17 simulator); the coordinator copies them to zinc-next-perf.md. The Android half (the GLES 3 replay on a capable Android device) is not done: this agent did no Android device work. AC2: on iOS the frame is the software raster's, and the Metal present shows the same pixels as SDL_Renderer (byte-identical screenshots). Comparing a GPU path with the desktop GL goldens waits for the Android GLES 3 replay and for the Metal back end. AC3: the text is above; it can be ticked once the coordinator writes it as a numbered record. AC4: ticked (the text follows D119: Metal is the GPU back end, scored against EAGL and ANGLE). Next command for the Android half: zinc export examples/rn-showcase --target android with ZINC_RENDERER=gl on a GLES 3 device or emulator, then ZINC_PRESENT_STATS and ZINC_GL_INFO as in ZN-741.
<!-- SECTION:NOTES:END -->
