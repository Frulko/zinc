---
id: ZN-425
title: PERF-26 Render scale option for pixel-art gfx programs on HiDPI windows
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
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
- [ ] #1 pixelScale logical renders at 1x and the window shows it magnified
- [ ] #2 default behaviour and pixel goldens unchanged
<!-- AC:END -->
