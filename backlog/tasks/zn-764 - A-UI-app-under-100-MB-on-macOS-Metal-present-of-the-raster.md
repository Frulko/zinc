---
id: ZN-764
title: A UI app under 100 MB on macOS (Metal present of the raster)
status: Done
assignee: []
created_date: '2026-10-20 00:50'
labels:
  - perf
  - desktop
  - size-M
milestone: m-21
dependencies: []
ordinal: 1002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-20: "faire qu'une app consomme moins de 100 Mo ... surtout les UI". A Zinc UI window on macOS showed 200+ MB in Activity Monitor (physical footprint): examples/agents 216 MB, ui/forms 133 MB, while its heap is ~23 MB. The cost is window-sized buffers (13.7 MB each for 1180x760 at density 2): the GL window held about nine (five presentation IOSurfaces, the replay's texture and its depth/stencil, the window's own depth/stencil, the software rows' texture and their CPU buffer kept after the splash). Make the window's default show the software raster through the Metal present iOS already has (targets/macos/hal_metal.mm: a shared MTLBuffer the GPU blits into the drawable), with two drawables, and stop the GL window keeping the splash's buffers. The measure is a tool run by hand, not a tier test (owner: "ne pas mettre ce test dans la ci").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 macOS: the window's default (ZINC_RENDERER unset or auto) is the software raster presented by Metal, for plain windows and windows with an app.window config; transparent windows and display plugins keep SDL_Renderer, --simulate keeps OpenGL (the picture's turn), ZINC_RENDERER=gl keeps OpenGL, ZINC_PRESENT=texture SDL_Renderer
- [x] #2 the macOS CAMetalLayer keeps at most two drawables (ZINC_DRAWABLES=3 to compare); ZINC_PIXEL_SCALE=logical magnifies with nearest filtering
- [x] #3 the desktop GL window makes its software rows and their texture only for frames of rows alone (the splash) and frees them when the replay draws
- [x] #4 tools/window-memory prints the physical footprint of projects with a window and fails above --max; not in any tier
- [x] #5 examples/agents, ui/forms, nuxt-ui, notify-relay under 100 MB on the development Mac; the window tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on the development Mac (arm64, macOS 15.7, 4K screens, load 15 to 19 from other sessions; memory does not depend on load as time does), physical footprint 8 s after start, `tools/window-memory`:

| project | GL before | Metal now (3 passes) |
|---|---|---|
| examples/agents (1180x760) | 211-216 MB | 81, 82, 103 MB (first run after a build) |
| examples/ui/forms | 133 MB | 45 MB |
| examples/notify-relay (app.window config) | 134 MB | 59 MB |
| examples/nuxt-ui | 79 MB | 75 MB |
| examples/rn-showcase | 96 MB | 65-89 MB |

ZINC_RENDERER=gl after AC#3: agents 170 MB (was 211), ui/forms 116 MB (was 133).

What stays for a 2360x1520 surface: the frame (shared MTLBuffer, 13.9 MB, counted once for CPU and GPU) and three 'CAMetalLayer Display Drawable' IOSurfaces (41.2 MB): with maximumDrawableCount 2 WindowServer still holds the one on screen, so there are N+1 (four with 3: 96 MB on agents). Heap ~12-37 MB depending on what the app is doing.

Speed: breakout and hero keep 60 fps on the Metal path (ZINC_PRESENT_STATS interval p50 16.7 ms; raster p50 0.5 ms breakout, 2.5 ms hero, p99 22 ms hero under load 19); GL showed the same interval for breakout. Not measured on a quiet machine. Only examples/music and music-tree draw zinc:gfx shaders; on the Metal path shaderAvailable() is false and they draw their CPU picture, as with ZINC_RENDERER=cpu.

PASS window_renderer (auto may be cpu), window_resize, window_live_resize, macos_window, gl_renderer, gpu_strokes, gl_scroll (with the branch's binary). Not checked by eye: the picture in the window (screencapture has no screen-recording permission in this session); the same blit runs on iOS since ZN-627. Decision D154.
<!-- SECTION:NOTES:END -->
