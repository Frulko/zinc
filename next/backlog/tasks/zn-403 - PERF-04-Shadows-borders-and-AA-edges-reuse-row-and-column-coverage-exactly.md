---
id: ZN-403
title: 'PERF-04 Shadows, borders and AA edges reuse row and column coverage exactly'
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 08:42'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-401
priority: high
ordinal: 5030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
raster.cpp:131 shadow_rrect evaluates a rounded-box SDF with sqrt plus smoothstep for every blur-band pixel: 15.9 us per 60x40 blur-10 shadow, 78% of b2-rounded (40.7 ms on 1 thread). In the straight middle rows the coverage depends only on the column, in the straight top/bottom columns only on the row: compute once and reuse; only the corner squares keep the per-pixel SDF. Same expressions on the same inputs, so same pixels. Same split for border_rrect (:111) and fill_rrect edges (:85).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SHADOW <= 4 us per command on b2-rounded (per-kind harness through zrt::raster::render)
- [x] #2 b2-rounded <= 15 ms on 1 thread (baseline 40.7 ms)
- [x] #3 pixel goldens of every UI demo identical (tolerance 0)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
shadow_rrect computes one alpha row per distinct key (qy bits + spans): top and bottom halves share their rows, and middle rows whose qy-ruled pixels are already full (so alphas depend on qx alone) share one row; per-row loops are branch-free (vectorizable) with the float operations of rr_sdf in the same order (sdf_q), blended by blend_alphas. border_rrect takes the row value over the straight part of top/bottom rows. Same pixels: b2-rounded hash d05bc629d0c042a4 unchanged.
Measured (1000x640, 1 thread, machine loaded by a research agent): b2-rounded 34.7 -> 14.4-14.7 ms; SHADOW 14.05 -> 4.38 us/cmd (best of 5; target 4 us: follow-up task), BORDER 1.76 -> 1.57-1.7 us. A hash table for the row keys was tried and was not faster than the newest-first scan: dropped.
Tests: tests/run --changed 44/44 (style_shadow, style_border included), proto-capture canary 4/4, framehash.
usage: n/a
<!-- SECTION:NOTES:END -->
