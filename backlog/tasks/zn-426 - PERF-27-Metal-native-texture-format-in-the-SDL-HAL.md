---
id: ZN-426
title: PERF-27 Metal-native texture format in the SDL HAL
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 09:39'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
hal_sdl.cpp:42 creates an XRGB8888 streaming texture; SDL3's Metal renderer supports only ARGB/ABGR8888 (SDL_render_metal.m:2410), so every SDL_UpdateTexture converts through Blit8888to8888PixelSwizzleNEON (1.6% of the main thread at 200k, ~0.5 ms per 1280x960 frame). Use ARGB8888 with SDL_BLENDMODE_NONE.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 no Blit8888to8888 in a window profile
- [x] #2 window screenshots identical; transparent windows unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
targets/macos/hal_sdl.cpp: the SDL_Renderer texture is ARGB8888 for every window (SDL's Metal renderer has no XRGB texture, so the XRGB one was converted at each SDL_UpdateTexture), blend mode NONE for an opaque window (the alpha byte the raster leaves at 0 is ignored), BLEND for a transparent one as before. This path serves ZINC_RENDERER=cpu, transparent windows, display plugins and machines without hardware GL; the default macOS window renders with the GL replay (ZN-412.02). Measured on the Intel Mac, bouncing-ball 200k with ZINC_RENDERER=cpu ZINC_VSYNC=0, 3 s sample of the main thread: before, SDL_UpdateTexture 67 of 1855 samples with SDL_ConvertPixelsAndColorspace 49 of them (the x86 SSE blit has no symbol here); after, SDL_UpdateTexture 63 of 2111 and no conversion (AC#1). AC#2: a CPU-rendered opaque window captured with screencapture -l before (the previous binary) and after: 0 differing pixels (tools/pngdiff); macos_vibrancy (transparent window), window_renderer and pixel_scale PASS. Usage: n/a.
<!-- SECTION:NOTES:END -->
