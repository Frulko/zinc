---
id: ZN-627
title: 'Mobile GPU path: GLES 3 replay on android, renderer decision for ios'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-10 14:07'
updated_date: '2026-10-17 00:15'
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
- [ ] #4 the iOS decision follows D119: our own Metal back end of the command lists, scored against GLES through EAGL and ANGLE on Metal for the record
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner): the Nexus 7 is GLES 2 only, so the Android GLES path is ZN-741's GLES 2 base; this task keeps GLES 3 for capable Android devices and the iOS decision. The 2026-09 scoring (docs/reports/parity/04-library-choices.md §2.10, ui-rendering-architecture.md §2.11) rejected bgfx for its shader tool chain when GLES 2 and Metal were not both required; now they are.

2026-10-16, later: the owner kept our own layer (D119); bgfx is not re-scored.

2026-10-17, step 1 (worktree agent): iOS presents without the texture upload. targets/macos/hal_metal.mm (new, iOS only): the window is made with SDL_WINDOW_METAL and no SDL_Renderer, the raster draws the damaged rows straight into a shared MTLBuffer (fb), each damaged frame is one GPU blit of it into the CAMetalLayer's drawable (BGRA8Unorm, opaque, framebufferOnly NO, aspect-fit gravity); the raster waits for the previous blit before writing (p99 <= 0.12 ms); a frame without damage presents nothing (the layer keeps it, the CADisplayLink paces). ZINC_PRESENT=texture keeps SDL_Renderer. hal_sdl.cpp, all inside SDL_PLATFORM_IOS except from_window/to_window's no-renderer no-GL branch (reached only on iOS; it maps window points to the surface aspect-fit, as SDL's logical presentation did): the window creation, alloc_surface (fb = the buffer), present_frame, hal_shutdown. The macOS preprocessed HAL is unchanged except __LINE__ values. CMake: hal_metal.mm in zn_app_host and the window sources on iOS, Metal and QuartzCore linked. Test: tests/t0/ios_present.sh (hal_sdl.cpp and hal_metal.mm compile for arm64-apple-ios16.3-simulator, -Wall -Wextra -Werror).
Measured on an iPhone 17 simulator (iOS 26.3, Release, ZINC_PRESENT_STATS, machine shared with other agents' builds at load 8-19): rn-showcase, 2 s rest + ten 400 pt flings + five tab switches (ZINC_INPUT, 1200 frames): texture (2 runs) raster p50 0.73-1.08, move 0.78-1.07, upload p50 6.61-7.47 p99 9.96-13.90, swap 0.25-0.28, interval p50 16.63-16.72 p99 18.26-20.73 ms, app CPU 5.34/5.52 s over 22 s; Metal (4 runs) raster p50 1.04-2.74, move 0.98-1.63, upload 0, draw 0.07-0.08 + wait 0.01-0.04, interval p50 16.64-16.71 p99 17.22-18.66 ms, app CPU 3.82-4.54 s. Main thread per drawn frame ~9.3 -> ~3.5 ms. At rest (10 s): 0.61/0.74 -> 0.16/0.17 s of CPU. hero (title screen, animating, 15 s): texture raster p50 1.75-3.92, upload p50 5.94-7.26 p99 8.89-11.14, interval p99 18.27-18.80; Metal raster p50 2.52-5.37, draw 0.06-0.09, interval p99 17.40-18.86 ms. The raster's own time rises ~1 ms on the Metal path; not the buffer's memory (a malloc'd frame + a copy of the damaged rows into the buffer, tried and dropped: raster 1.16-1.80 + copy 0.38-0.48 ms), most likely the host scheduler with 7 ms less work a frame. Pixels: simctl screenshots of the first screen and of the end of the scripted session are byte-identical on both paths; mid-session the More tab shows (taps went through). A no-copy buffer over malloc'd memory (newBufferWithBytesNoCopy) ended the app on the simulator at start; dropped. Report: docs/reports/zinc-next-ios.md 'The present'. macOS: the desktop window presents with the GL replay; only ZINC_RENDERER=cpu, transparent windows and display plugins use SDL_Renderer there (later.md line).
<!-- SECTION:NOTES:END -->
