---
id: ZN-677
title: >-
  Software sprites: fixed-point stepping in draw_boxed and a drawImageRect case
  in bench/render
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - perf
  - gfx
  - size-S
dependencies: []
ordinal: 433410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) Optional; may fold into ZN-581 (GPU sprites). The boxed image draw of the software raster steps in floating point.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a drawImageRect case in bench/render with its number before and after in docs/reports/zinc-next-perf.md
- [ ] #2 pixel goldens of image_rect unchanged
<!-- AC:END -->
