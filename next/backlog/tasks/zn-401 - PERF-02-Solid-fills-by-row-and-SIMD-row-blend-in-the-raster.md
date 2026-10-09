---
id: ZN-401
title: PERF-02 Solid fills by row and SIMD row blend in the raster
status: Backlog
assignee: []
created_date: '2026-10-09 07:33'
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
- [ ] #1 CLEAR and opaque RECT use row fills; alpha runs use a vector row blend with a scalar tail
- [ ] #2 200k scene on 1 thread <= 25 ms (baseline 65 ms); CLEAR of 1000x640 <= 0.06 ms
- [ ] #3 pixel goldens (tools/proto-capture compare) and render corpus hashes unchanged
<!-- AC:END -->
