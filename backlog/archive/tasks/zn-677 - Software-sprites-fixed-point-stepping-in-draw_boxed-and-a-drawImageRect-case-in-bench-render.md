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
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. (merge proposed, corrected by the verifier) Different code paths: draw_boxed (runtime/raster.cpp:860) is the axis-aligned boxed image draw; ZN-680 is the transformed-command raster draw_xform (raster.cpp:1086) under setTransform. The task calls itself optional, and GPU sprites (ZN-581) are Done, so a later.md line fits better than folding it into ZN-680.
<!-- SECTION:NOTES:END -->
