---
id: ZN-743
title: 'Zero-copy present: the software raster draws into the window buffer'
status: Backlog
assignee: []
created_date: '2026-10-16 14:00'
labels:
  - mobile
  - perf
  - size-M
milestone: m-26
dependencies:
  - ZN-622
ordinal: 196400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16: "on veut du zéro copie". On the Nexus 7 (rn-showcase, software raster through SDL_Renderer, ZN-622) the perf panel shows work p50 1.3-1.7 ms but present (pre) 22.6-23.1 ms and 23-44 fps; hal_sdl.cpp already uploads only the damaged rows (lines 932-973), so first split where those 23 ms go (SDL_UpdateTexture, SDL_RenderTexture, SDL_RenderPresent/eglSwapBuffers, vsync wait). Then remove the copy: on Android the raster renders the damaged rows straight into the window's own buffer (ANativeWindow from SDL_PROP_WINDOW_ANDROID_WINDOW_POINTER, ANativeWindow_setBuffersGeometry with an RGBX_8888 or RGB_565 format, ANativeWindow_lock with the dirty bounds so the system keeps the rest, ANativeWindow_unlockAndPost), with no texture and no GL context on that surface; SurfaceFlinger composes the buffer directly. This is the CPU half of zero copy; the GPU half is ZN-741 (the replay draws, no pixels on the CPU). Design seam (D119): each context provider offers either a GL context or a CPU buffer the raster writes into (fbdev and the KMS dumb buffer already are, ANativeWindow now, IOSurface/CALayer on macOS and iOS later). Pixel format, stride and the raster's channel order must match the buffer, not be converted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 where the 23 ms of present go on the Nexus 7, split by step, in the task notes and docs/reports/zinc-next-perf.md
- [ ] #2 Android: the raster writes the damaged rows into the locked ANativeWindow buffer, no SDL texture and no GL context in that mode; ZINC_PRESENT=texture keeps the old path for comparison
- [ ] #3 rn-showcase and hero on the Nexus 7: p50/p99 frame and present times before and after with the perf panel, in docs/reports/zinc-next-perf.md
- [ ] #4 the screencap of a still frame equals the texture path's (same pixels, both formats tried: RGBX_8888, RGB_565 noted as dithered or not)
- [ ] #5 the providers that could do the same (KMS dumb buffer, macOS/iOS IOSurface) are one line each in backlog/later.md
<!-- AC:END -->
