---
id: ZN-657
title: 'zinc:3d on the GPU: antialiasing and texture filtering'
status: Done
assignee: []
created_date: '2026-10-10 18:17'
updated_date: '2026-10-10 19:01'
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
- [x] #1 an option of the renderer and of a material selects the filtering; the default is documented
- [x] #2 edge coverage measured on a test scene: fewer than a set share of stair-stepped edge pixels with multisampling on
- [x] #3 frame time of examples/3d on the development Mac before and after, in docs/reports/zinc-next-perf.md
- [x] #4 the software frames and their goldens are unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. GPU renderer (plugins/3d/native/render3d.gl.cpp): multisampled framebuffer (renderbuffers, GL_MAX_SAMPLES) resolved with glBlitFramebuffer into the texture that is read back, option msaa (4, ZINC_3D_MSAA), a plain framebuffer when the multisampled one is incomplete; texture filter per draw from bits 4-5 of the flags (material Filter: Default/Nearest/Linear/Mipmap) else the option filter ('mipmap', ZINC_3D_FILTER), mipmaps generated at the first use after an upload, parameters set only when they change. gpu() in the native interface (software and sim false). zinc:3d: Material.filter, Camera.pixelRatio (0 = gfx.pixelScale() on the GPU, 1 in software). three: Texture.minFilter defaults to LinearMipmapLinearFilter (three.js's), the filter constants, and the renderer passes the texture's filters. plugin.json options msaa and filter (plugin_manifest expectations updated, PASS).
AC1: options documented in docs/plugins/3d.md (default mipmap, msaa 4). AC2: tests/t1/zinc3d_aa.sh: stair-stepped edge pixels 100% without and 60.4% with 4 samples (limits 95% / 75%); a nearest material keeps two colours under the linear option (0 grey pixels inside), the default one blends (9180). AC3: perf log: 3d/cubes 0.385 -> 0.445 ms per frame, 3d/model 0.332 -> 0.394 (4x MSAA); 1.2 ms at pixel scale 2. AC4: software frames unchanged (3d-cubes 0 px, 3d-model 3 px and three-cubes 5 px, the known differences as before); three_gpu (GPU vs software SSIM), templates_kickstart, museum_panorama PASS; three_3d fails only on its two known differences.
usage: n/a
<!-- SECTION:NOTES:END -->
