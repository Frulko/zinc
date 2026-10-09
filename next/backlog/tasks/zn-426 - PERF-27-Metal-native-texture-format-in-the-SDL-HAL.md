---
id: ZN-426
title: PERF-27 Metal-native texture format in the SDL HAL
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
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
- [ ] #1 no Blit8888to8888 in a window profile
- [ ] #2 window screenshots identical; transparent windows unchanged
<!-- AC:END -->
