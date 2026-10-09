---
id: ZN-563
title: 'zinc:3d and three (the Zinc subset) on the GPU through zinc:gl'
status: Backlog
assignee: []
created_date: '2026-10-09 07:59'
updated_date: '2026-10-09 08:06'
labels:
  - perf
  - 3d
milestone: m-21
dependencies:
  - ZN-562
priority: high
ordinal: 342270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/three is three.js's API written in Zinc, compiled AOT like any Zinc code, but it renders with zinc:3d on the CPU. Add a GPU renderer to it on zinc:gl: buffers per geometry, one program per material kind (basic, Lambert, Phong, Standard where the tier allows), uniforms from the scene graph, depth, textures, picking unchanged; zinc:3d stays the renderer without a GPU and the oracle. The same three-style program then runs with native logic and GPU drawing, so the limit is the GPU, not JavaScript. Feeds RPI-3D-10 (cooked packs) and the handheld zinc:3d backends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/three/cubes and examples/three/gltf-viewer render on the GPU backend in AOT with SSIM >= 0.95 against the zinc:3d frames
- [ ] #2 1000 meshes animate at 60 fps on macOS and the CPU time per frame is recorded against real three.js on QuickJS for the same scene
- [ ] #3 the zinc:3d path and its goldens stay unchanged; the renderer is chosen by tier or zinc.json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner 2026-10-09: 'why is zinc:3d not GPU? yes to everything (a, b, c, d)'. Scope widened: the GPU renderer goes into zinc:3d itself, as a new native backend next to render3d.host/rpi1/esp32/wasm.cpp (render3d.gl.cpp on zinc:gl / GLES2-GLES3), so plugins/three, which draws through zinc:3d, gets the GPU for free; the handheld backends (render3d.psp/vita/n3ds/ios, ZN-453..511) follow the same interface. The software backend stays for targets without a GPU and as the oracle.
<!-- SECTION:NOTES:END -->
