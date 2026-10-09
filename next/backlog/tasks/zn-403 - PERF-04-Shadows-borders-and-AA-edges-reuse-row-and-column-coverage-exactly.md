---
id: ZN-403
title: 'PERF-04 Shadows, borders and AA edges reuse row and column coverage exactly'
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
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
- [ ] #2 b2-rounded <= 15 ms on 1 thread (baseline 40.7 ms)
- [ ] #3 pixel goldens of every UI demo identical (tolerance 0)
<!-- AC:END -->
