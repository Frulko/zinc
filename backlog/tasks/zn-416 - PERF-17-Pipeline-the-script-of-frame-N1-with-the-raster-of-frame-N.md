---
id: ZN-416
title: >-
  PERF-17 Pipeline the script of frame N+1 with the CPU raster of frame N (Linux
  fbdev, Pi, handhelds)
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-10 08:18'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-400
priority: medium
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/gfx.cpp:767 end_frame and hal_sdl.cpp:432 hal_present run synchronously: at 200k the main thread waits on the bands 63% of the frame. A third command buffer lets end_frame hand frame N to the workers and return; the upload of N happens when its bands finish. One frame of latency, opt-out; ZINC_SHOT and deterministic runs stay synchronous.

Also carries, since the backlog review of 2026-10-10: ZN-185 (R3.6 Render thread and 3-slot handoff).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 window frame time = max(script+diff, raster) within 10% on bouncing-ball 200k (measured with sample)
- [ ] #2 deterministic captures and pixel goldens unchanged
- [ ] #3 input latency documented and opt-out in zinc.json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10, re-prioritised to the cross-platform pass (owner: the development Mac first). Since ZN-412.02 the macOS window renders with the GL replay by default: a sample at bouncing-ball 200k shows no zrt::raster::render on the main thread, 119 fps with ZINC_VSYNC=0 and 60 fps with vsync. The 63% wait this task removes exists only on the software raster: Linux without GL, fbdev/KMS, the Pi, the handhelds, ZINC_RENDERER=cpu. Measure and do it there, with the CPU renderer's own numbers.
<!-- SECTION:NOTES:END -->
