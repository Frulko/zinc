---
id: ZN-678
title: 'GL replay: smoothed edges and one filter rule for images through a matrix'
status: Backlog
assignee: []
created_date: '2026-10-10 19:21'
labels:
  - gpu
  - gfx
  - size-S
dependencies: []
ordinal: 434410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) Under setTransform the raster smooths the edge of a turned image and the GL replay cuts it (0.217% of pixels over 24 on tests/data/image_rect/xform.ts, max 84), and a whole opaque runtime image at one texel per pixel is sampled nearest by GL but linearly by the raster. The museum table and the pinball editor draw turned images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 xform.ts and gfx_transform under 0.05% of pixels over 24 at the same density
- [ ] #2 the plain (untransformed) frames unchanged
<!-- AC:END -->
