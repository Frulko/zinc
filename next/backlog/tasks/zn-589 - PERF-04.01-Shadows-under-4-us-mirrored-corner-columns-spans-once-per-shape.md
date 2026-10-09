---
id: ZN-589
title: 'PERF-04.01 Shadows under 4 us: mirrored corner columns, spans once per shape'
status: Backlog
assignee: []
created_date: '2026-10-09 08:42'
labels:
  - perf
milestone: m-21
dependencies:
  - ZN-403
priority: low
ordinal: 368270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-403: shadows went from 14.05 to 4.38 us per command on b2-rounded (best of 5 under load), the target was 4 us. Left: the left and right corners of a row are computed separately although their qx are mirror images (bit-equal when 2cx is a pixel boundary), and row_span runs twice per row (two square roots).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SHADOW <= 4 us per command on b2-rounded (per-kind harness), unloaded machine
- [ ] #2 pixel goldens identical (hash d05bc629d0c042a4 for b2-rounded)
<!-- AC:END -->
