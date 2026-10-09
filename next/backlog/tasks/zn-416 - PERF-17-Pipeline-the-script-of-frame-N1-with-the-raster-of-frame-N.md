---
id: ZN-416
title: PERF-17 Pipeline the script of frame N+1 with the raster of frame N
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-400
priority: medium
ordinal: 5160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/gfx.cpp:767 end_frame and hal_sdl.cpp:432 hal_present run synchronously: at 200k the main thread waits on the bands 63% of the frame. A third command buffer lets end_frame hand frame N to the workers and return; the upload of N happens when its bands finish. One frame of latency, opt-out; ZINC_SHOT and deterministic runs stay synchronous.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 window frame time = max(script+diff, raster) within 10% on bouncing-ball 200k (measured with sample)
- [ ] #2 deterministic captures and pixel goldens unchanged
- [ ] #3 input latency documented and opt-out in zinc.json
<!-- AC:END -->
