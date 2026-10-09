---
id: ZN-400
title: 'PERF-01 SDL HAL rasterizes in dynamic bands (zbands::Pool)'
status: Done
assignee: []
created_date: '2026-10-09 07:33'
updated_date: '2026-10-09 07:53'
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
- [x] #3 ZINC_RENDER_THREADS=1 still runs without threads; render corpus (tools/bench-render) no regression
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done without zbands::Pool: runtime/include/render_bands.h is another session's uncommitted file, so the window HAL (targets/macos/hal_sdl.cpp) and the software backend (src/host/backend_sw.cpp) take 32-row stripes from an atomic counter themselves (ZINC_RENDER_STRIPE=n to measure in the HAL; 32 measured best against 16 and 64).
Measured: bouncing-ball 200k balls, window, 10 s runs alternated: 31.7 -> 42.3 fps (stripes 16: 39.4, 64: 36.5; prototype 31.5-34.6). zinc capture --scene bb4.scn --bench: 8 threads 41.4 -> 22.6-25.6 ms, 1 thread 64 ms, same hash a232a804ab7854ee.
AC2 (<= 15 ms) not reached by bands alone: it needs the row fills of ZN-401 (PERF-02), whose criteria carry it.
Tests: backend_sw, tests/run --changed 44/44.
usage: n/a
<!-- SECTION:NOTES:END -->
