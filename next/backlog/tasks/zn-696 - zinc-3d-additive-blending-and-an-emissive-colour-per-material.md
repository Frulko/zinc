---
id: ZN-696
title: 'zinc:3d: additive blending and an emissive colour per material'
status: In Progress
assignee: []
created_date: '2026-10-10 21:27'
updated_date: '2026-10-10 21:28'
labels:
  - 3d
  - gpu
  - size-M
milestone: m-27
dependencies: []
ordinal: 460410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the pinball's sound and look, D80.) The pinball draws a pool of light as an opaque patch of a second, lit painting because zinc:3d has no blending and no emissive term: pools cannot overlap and exist on the playfield only. Additive (and alpha) blending per material and an emissive colour, on the software and the GPU renderer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a lit quad adds to what is under it on both renderers (a golden each, GPU within tolerance)
- [ ] #2 two overlapping glows add up
- [ ] #3 the opaque path's frames and goldens are unchanged and its frame time is not higher (measured)
<!-- AC:END -->
