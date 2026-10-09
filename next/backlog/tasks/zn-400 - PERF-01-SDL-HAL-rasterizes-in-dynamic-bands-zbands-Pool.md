---
id: ZN-400
title: 'PERF-01 SDL HAL rasterizes in dynamic bands (zbands::Pool)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:33'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/macos/hal_sdl.cpp:373-430 splits the damaged rows into workers+1 equal bands. 200k-ball scene 1280x960: 1 thread 65.3 ms, 8 bands 41.4 ms because 62% of the pixels fall in one band (window: main thread waits 63% of the frame). Use runtime/include/render_bands.h (zbands::Pool, 16-32 row bands from an atomic counter, already used by display-fbdev) and delete the HAL's own workers. Harness: 18.0 -> 9.8 ms. Pixels identical by construction. Matters for Pi 3, Vita, iPhone 4S, desktop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hal_sdl.cpp uses zbands::Pool; its own band workers are removed
- [ ] #2 zinc capture --scene of the 200k bouncing-ball dump (frame 400, ZINC_SCALE=4) rasterizes in <= 15 ms on 8 threads (baseline 41.4 ms), same pixel hash
- [ ] #3 ZINC_RENDER_THREADS=1 still runs without threads; render corpus (tools/bench-render) no regression
<!-- AC:END -->
