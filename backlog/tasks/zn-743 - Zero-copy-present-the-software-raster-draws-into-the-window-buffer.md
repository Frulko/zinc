---
id: ZN-743
title: 'Zero-copy present: the software raster draws into the window buffer'
status: Backlog
assignee: []
created_date: '2026-10-16 14:00'
updated_date: '2026-10-25 01:53'
labels:
  - mobile
  - perf
  - size-M
milestone: m-26
dependencies:
  - ZN-622
ordinal: 54800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Close once hero is measured on the Nexus 7 (or drop AC3 hero half: hero does not export without libavformat). Already there: targets/macos/hal_sdl.cpp anw_present; docs/reports/zinc-next-android.md; task notes.

Owner 2026-10-16: "on veut du zéro copie". On the Nexus 7 (rn-showcase, software raster through SDL_Renderer, ZN-622) the perf panel shows work p50 1.3-1.7 ms but present (pre) 22.6-23.1 ms and 23-44 fps; hal_sdl.cpp already uploads only the damaged rows (lines 932-973), so first split where those 23 ms go (SDL_UpdateTexture, SDL_RenderTexture, SDL_RenderPresent/eglSwapBuffers, vsync wait). Then remove the copy: on Android the raster renders the damaged rows straight into the window's own buffer (ANativeWindow from SDL_PROP_WINDOW_ANDROID_WINDOW_POINTER, ANativeWindow_setBuffersGeometry with an RGBX_8888 or RGB_565 format, ANativeWindow_lock with the dirty bounds so the system keeps the rest, ANativeWindow_unlockAndPost), with no texture and no GL context on that surface; SurfaceFlinger composes the buffer directly. This is the CPU half of zero copy; the GPU half is ZN-741 (the replay draws, no pixels on the CPU). Design seam (D119): each context provider offers either a GL context or a CPU buffer the raster writes into (fbdev and the KMS dumb buffer already are, ANativeWindow now, IOSurface/CALayer on macOS and iOS later). Pixel format, stride and the raster's channel order must match the buffer, not be converted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 where the 23 ms of present go on the Nexus 7, split by step, in the task notes and docs/reports/zinc-next-perf.md
- [x] #2 Android: the raster writes the damaged rows into the locked ANativeWindow buffer, no SDL texture and no GL context in that mode; ZINC_PRESENT=texture keeps the old path for comparison
- [ ] #3 rn-showcase and hero on the Nexus 7: p50/p99 frame and present times before and after with the perf panel, in docs/reports/zinc-next-perf.md
- [x] #4 the screencap of a still frame equals the texture path's (same pixels, both formats tried: RGBX_8888, RGB_565 noted as dithered or not)
- [x] #5 the providers that could do the same (KMS dumb buffer, macOS/iOS IOSurface) are one line each in backlog/later.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (worktree agent). Report: docs/reports/zinc-next-android.md, 'Zero-copy present (ZN-743)'.

AC1, where the present of the texture path goes (ZINC_PRESENT_STATS=1, a new switch of hal_sdl.cpp: raster / upload / draw / swap, p50 and p99 per 120 frames, in logcat; and a trace of a scripted fling): at rest SDL_RenderPresent 14 to 15 ms (the wait for the display), the rest 0; while scrolling rn-showcase raster 25 to 26 ms, SDL_UpdateTexture 9.4 to 9.8 ms, RenderClear+RenderTexture 0.02 ms, RenderPresent 1.6 to 1.8 ms; breakout SDL_UpdateTexture of 1 to 3 rows 14.5 ms p50 (it waits for the GPU still reading the texture). The numbers for docs/reports/zinc-next-perf.md are below (the coordinator writes that file).

AC2: hal_sdl.cpp anw_present: on Android the window is created without a renderer; ANativeWindow_lock with the damage box as dirty bounds, HalFrame.render_box (new, runtime/include/hal.h + gfx.cpp: every pixel of a box, nothing outside it) draws the box Android returns (the whole buffer after a new surface or size) straight into the buffer, unlockAndPost; BGRA_8888 (HAL format 5) = the raster's byte order, no conversion; stride != width or ZINC_PRESENT=565 go through fb and a copy/pack; ZINC_PRESENT=texture keeps the SDL_Renderer path; our own ANativeWindow reference (acquire/release) so a surface SDL drops is never locked after it is gone; frames without damage post nothing and sleep to the next 16.7 ms. The parallel bands write any buffer of PW pixels per row (band_px).

AC3 (rn-showcase and breakout on the Nexus 7, 2026-10-16 16:56, the tablet to this agent alone; runs of 16:38 to 16:50 discarded: another agent's app came to the front): rn-showcase scripted fling (ZINC_INPUT fling.txt, ten 400 px flings; the frames that rasterized more than 2 ms): texture interval p50 40.6 p99 60.7 ms (24.6 fps), raster 26.0, present without raster p50 12.8 p99 18.2; window buffer interval p50 31.3 p99 53.7 (31.9 fps), raster 25.6, present p50 4.2 p99 20.2. At rest: texture present p50 14.5 p99 19.5, buffer 14.8 / 15.8 (60 fps both). breakout: present p50 16.27 / 16.37, p99 26.6 / 26.2 (60 fps both). hero: not measured, it does not export (zinc:video needs libavformat, ZN-628): this half of AC3 stays open.

AC4: ZINC_PRESENT_VERIFY=1 (new) compares the whole buffer with a full redraw at each post: 0 stale pixels in 480 posts of the fling, partial boxes included. A screencap cannot show exact equality here: Tegra 3's compositor resamples at mediump (the texture path differs from a desktop raster of the same frame on 28,925 edge pixels, max 32 levels; the buffer path on 20,077, max 20, the compositor's share; texture vs buffer 26,128 pixels, max 24). RGB_565 (ZINC_PRESENT=565, packed by truncation): not dithered, the card gradients band (795,864 pixels differ, max 28).

AC5, lines for backlog/later.md (Cross-platform pass / Performance), for the coordinator:
- ZN-743: the KMS dumb buffer and fbdev (plugins/display-fbdev, plugins/display-gl kms.cpp) could take HalFrame.render_box and draw the damage straight into the scanout buffer, as the Android window buffer does now.
- ZN-743: macOS and iOS: an IOSurface (CALayer.contents) written by the raster in place of SDL_UpdateTexture + a Metal quad: the same zero copy on Apple, measured against the texture path.
- ZN-743: Android: buffer age instead of copy-back (ANativeWindow_lock copies the region outside the box from the previous buffer at each post: part of the 4.2 ms that remain).

Also in this commit: hal_dispatch.cpp lets a window run take a ZINC_INPUT script (the scripted fling on a real display, used for AC3 and ZN-744).

Handover: everything is in except the hero half of AC3, which needs hero to export (zinc:video without libavformat, ZN-628). Then build hero's APK (zinc export --target android, gradlew assembleDebug -Pzinc.abis=armeabi-v7a) and repeat the measures of these notes with ZINC_PRESENT=texture and with the default (am start with zinc.env ZINC_PERF_HUD=1 ZINC_PROFILE=1 ZINC_PRESENT_STATS=1 ZINC_TRACE=trace.json).
Review 2026-10-25: done-partly. Present measured and zero-copy ANativeWindow path written and verified (0 stale pixels); only hero numbers remain, blocked by zinc:video on phones. Evidence: targets/macos/hal_sdl.cpp anw_present; docs/reports/zinc-next-android.md; task notes
<!-- SECTION:NOTES:END -->
