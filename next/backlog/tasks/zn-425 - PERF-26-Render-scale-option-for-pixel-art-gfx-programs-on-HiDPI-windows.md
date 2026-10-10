---
id: ZN-425
title: PERF-26 Render scale option for pixel-art gfx programs on HiDPI windows
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 09:34'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
hal_sdl.cpp:54 k = zoom * density renders a 320x240 program at 1280x960 on Retina with zoom 2 (16x the logical pixels; the 200k scene writes 144.8 M pixels instead of 9 M at 1x). Add zinc.json targets.<id>.pixelScale density|logical (default unchanged), magnify the rest on the GPU with nearest filtering.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pixelScale logical renders at 1x and the window shows it magnified
- [x] #2 default behaviour and pixel goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc.json targets.<id>.pixelScale: "density" (default, unchanged: the zoom times the screen density) or "logical" (frames drawn at 1x, magnified by the window with nearest filtering). src/frontend/project (TargetOptions::pixelScale), src/main.cpp sets ZINC_PIXEL_SCALE for the run (inherited by a compiled run's executable), targets/macos/hal_sdl.cpp: K = 1 in apply_size when logical (ZINC_SCALE still overrides), SDL_Renderer texture SDL_SCALEMODE_NEAREST, and the GL present pass samples with GL_NEAREST. Measured in a real window on the Intel Mac (Retina, a 320x240 program at zoom 2): pixelScale() 4 by default, 1 with logical: 16x fewer pixels per frame (76,800 instead of 1,228,800). docs/guide/03-ui-apps.md lists the key. AC#1: new tests/t1/pixel_scale.sh (zinc.json logical -> 'scale 1 size 320 240', default -> more than 1). AC#2: the default path is untouched (logical_px false); headless runs and the pixel goldens do not use the SDL HAL; window_renderer, macos_window and project PASS. Usage: n/a.
<!-- SECTION:NOTES:END -->
