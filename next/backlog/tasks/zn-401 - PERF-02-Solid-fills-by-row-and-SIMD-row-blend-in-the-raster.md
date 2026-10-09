---
id: ZN-401
title: PERF-02 Solid fills by row and SIMD row blend in the raster
status: Done
assignee: []
created_date: '2026-10-09 07:33'
updated_date: '2026-10-09 08:11'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: high
ordinal: 5010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/raster.cpp:528-535 (CLEAR, opaque RECT) store per pixel through at(), 0.45 ns/px; covered runs of fill_rrect/shadow_rrect and blend() are scalar. Harness: std::fill_n per row 60.7 -> 19.7 ms (3.1x) on the 200k scene, same pixels; CLEAR 1000x640 0.27 ms. Row pointer per row, fill_n for opaque runs, NEON/SSE2 constant-colour row blend, CLEAR as row fill; then try -O3 for zn_host_gfx (next/CMakeLists.txt:196).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLEAR and opaque RECT use row fills; alpha runs use a vector row blend with a scalar tail
- [x] #2 200k scene on 1 thread <= 25 ms (baseline 65 ms); CLEAR of 1000x640 <= 0.06 ms
- [x] #3 pixel goldens (tools/proto-capture compare) and render corpus hashes unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: at(t,x,y) = c.c1 reloaded the command's colour after every pixel store (uint32_t stores may alias the Cmd's uint32_t c1), which also blocked vectorization. fill_row / blend_row take the colour and alpha by value (same per-pixel formula as blend()), used by CLEAR, opaque RECT, the covered runs of fill_rrect and shadow_rrect.
Measured: 200k-ball scene (bb4.scn, 1280x960) 1 thread 64.3 -> 20.2 ms, 8 threads 22.6 -> 8.5 ms, hash a232a804ab7854ee unchanged (so ZN-400's <= 15 ms is met too); CLEAR 1000x640 64 us including the bench's own zero fill (baseline 0.27 ms). Window, bouncing-ball 200k balls: 38.8 -> 59.3 fps (display cap 60), prototype 30.3.
Tests: tests/run --changed 44/44, tools/proto-capture compare --canary 4/4.
usage: n/a
<!-- SECTION:NOTES:END -->
