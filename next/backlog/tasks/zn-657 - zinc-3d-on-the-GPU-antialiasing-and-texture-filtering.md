---
id: ZN-657
title: 'zinc:3d on the GPU: antialiasing and texture filtering'
status: Backlog
assignee: []
created_date: '2026-10-10 18:17'
labels:
  - 3d
  - gpu
  - size-M
milestone: m-27
dependencies: []
ordinal: 410410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answers, 2026-10-10, for the showcase demos of M27.) Found by the backlog review: the GPU renderer of zinc:3d (ZN-563, D58) samples textures at the nearest texel and has no multisampling, which shows on the edges of a pinball table and on the textured models of museum objects. Multisampled rendering where the context offers it, mipmaps and linear or trilinear filtering per material, with the software renderer unchanged as the reference.

Also found by the museum table (ZN-650.03): zinc:3d renders in logical pixels, so a scene is at half density in a Retina window; render at the window's pixel scale (or a pixel ratio on the Camera) as part of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an option of the renderer and of a material selects the filtering; the default is documented
- [ ] #2 edge coverage measured on a test scene: fewer than a set share of stair-stepped edge pixels with multisampling on
- [ ] #3 frame time of examples/3d on the development Mac before and after, in docs/reports/zinc-next-perf.md
- [ ] #4 the software frames and their goldens are unchanged
<!-- AC:END -->
