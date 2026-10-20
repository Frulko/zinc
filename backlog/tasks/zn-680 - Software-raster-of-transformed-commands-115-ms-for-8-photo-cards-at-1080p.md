---
id: ZN-680
title: 'Software raster of transformed commands: 115 ms for 8 photo cards at 1080p'
status: Backlog
assignee: []
created_date: '2026-10-10 19:36'
labels:
  - perf
  - raster
  - size-M
dependencies: []
ordinal: 436410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) Under setTransform the software raster takes 115 ms per frame for the 8 cards of the museum sample and 330 ms for 30, so the software path is usable for captures only (the window renders on the GPU).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the 8-card frame under 16 ms on the development Mac, measured alone, before and after in docs/reports/zinc-next-perf.md
- [ ] #2 goldens of gfx_transform, image_rect and museum_table unchanged
<!-- AC:END -->
