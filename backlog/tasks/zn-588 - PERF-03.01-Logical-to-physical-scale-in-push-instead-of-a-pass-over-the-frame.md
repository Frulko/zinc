---
id: ZN-588
title: PERF-03.01 Logical-to-physical scale in push instead of a pass over the frame
status: Done
assignee: []
created_date: '2026-10-09 08:30'
updated_date: '2026-10-10 14:16'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-402
priority: low
ordinal: 367270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-402: to_physical (runtime/gfx.cpp) rescales every command after the frame when the pixel scale is above 1: about 0.3 ms at scale 4 with 200k commands (perf audit). Scale in box()/push() as commands are recorded; plugin commands keep the pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 no to_physical pass for zinc:gfx commands at scale > 1; plugin commands still scaled
- [x] #2 pixel goldens at scale 2 and 4 unchanged
- [x] #3 end_frame time at 200k commands, scale 4, measured before and after
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (usage: n/a, session total).
- runtime/gfx.cpp: box() and every recording function multiply by rec_k() (the pixel scale; 1 inside beginImage..endImage, whose image is in logical pixels); drawText takes the physical font and rasterizes missing glyphs at record time (as the pass did); add_points and stroke scale points and boxes in the same float order as the pass (stroke outlines are still built in logical pixels). gfx::emit records the index of each plugin command (filled in logical pixels after emit) and to_physical converts only those. Bug met on the way: the scale variable in add_points was shadowed by the loop index k (caught by the frame hashes).
- AC1: no pass over zinc:gfx commands; plugin commands (3d image, canvas2d, svg, map) still converted.
- AC2: frame hashes identical to the former code at scales 2 and 4 on 12 programs x 6 frames (hero, nuxt-ui, canvas/sketch, maps/svg-gallery, maps/navigation, 3d/cubes, three/cubes, bouncing-ball, breakout, host_direct, rn-showcase, text) and on tests/data/scale_push (every primitive, beginImage, a zinc:3d image; golden recorded with the former code): tests/t1/scale_push.sh. perf_hud, host_direct, pixel_scale, gl_renderer, webgl_present pass; three_3d fails as before (known).
- AC3: bench/scale_push.ts, 200k commands, scale 4, AOT; the machine was loaded by other agents' builds (load 90-120), so main-thread CPU time: end_frame before present 0.81-0.93 ms -> 2-3 us; whole frame p50 20.3-21.2 -> 18.5-20.4 ms. docs/reports/zinc-next-perf.md.
<!-- SECTION:NOTES:END -->
